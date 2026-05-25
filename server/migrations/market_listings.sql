-- ============================================================
-- Market Listings Migration
-- 執行方式：貼到 Supabase SQL Editor 執行
-- ============================================================

-- 啟用 pg_trgm（模糊搜尋用）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_listings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_nickname text,
  item_type       text        NOT NULL CHECK (item_type IN ('equipment','consumable','card')),
  item_name       text        NOT NULL,
  item_snapshot   jsonb       NOT NULL,
  affix_stats     text[],
  quality         text,
  price           integer     NOT NULL CHECK (price > 0 AND price <= 999999999),
  qty             integer     NOT NULL DEFAULT 1 CHECK (qty > 0),
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','sold','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sold_at         timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_market_status_type
  ON market_listings (status, item_type);

CREATE INDEX IF NOT EXISTS idx_market_quality
  ON market_listings (quality)
  WHERE quality IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_affix_stats
  ON market_listings USING GIN (affix_stats);

CREATE INDEX IF NOT EXISTS idx_market_item_name_trgm
  ON market_listings USING GIN (item_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_market_seller
  ON market_listings (seller_user_id, status);

-- ── RPC: buy_listing ─────────────────────────────────────────
-- 原子執行：扣買家 gold + 寫入道具 + 結單
CREATE OR REPLACE FUNCTION buy_listing(
  p_listing_id    uuid,
  p_buyer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing     market_listings%ROWTYPE;
  v_buyer_save  jsonb;
  v_gold        int;
  v_snapshot    jsonb;
  v_item_id     text;
  v_found       bool;
  v_new_arr     jsonb;
  v_elem        jsonb;
  v_i           int;
  v_len         int;
BEGIN
  -- 鎖定清單 row，防止同時購買
  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'listing_not_found');
  END IF;

  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'listing_not_active');
  END IF;

  IF v_listing.seller_user_id = p_buyer_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_buy_own');
  END IF;

  -- 鎖定買家存檔
  SELECT save_data INTO v_buyer_save
  FROM player_saves
  WHERE user_id = p_buyer_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'save_not_found');
  END IF;

  v_gold := (v_buyer_save -> 'inventory' ->> 'gold')::int;

  IF v_gold < v_listing.price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_gold');
  END IF;

  v_snapshot := v_listing.item_snapshot;

  -- 依 item_type 寫入買家存檔
  IF v_listing.item_type = 'equipment' THEN

    v_buyer_save := jsonb_set(
      v_buyer_save,
      '{player,owned}',
      (v_buyer_save -> 'player' -> 'owned') || jsonb_build_array(v_snapshot)
    );

  ELSIF v_listing.item_type = 'consumable' THEN

    v_item_id := v_snapshot ->> 'id';
    v_found   := false;
    v_new_arr := '[]'::jsonb;
    v_len     := jsonb_array_length(v_buyer_save -> 'inventory' -> 'items');

    FOR v_i IN 0 .. v_len - 1 LOOP
      v_elem := v_buyer_save -> 'inventory' -> 'items' -> v_i;
      IF v_elem ->> 'id' = v_item_id THEN
        v_elem  := jsonb_set(v_elem, '{qty}',
                    to_jsonb((v_elem ->> 'qty')::int + v_listing.qty));
        v_found := true;
      END IF;
      v_new_arr := v_new_arr || jsonb_build_array(v_elem);
    END LOOP;

    IF NOT v_found THEN
      v_new_arr := v_new_arr || jsonb_build_array(
        jsonb_build_object(
          'id',   v_item_id,
          'name', v_snapshot ->> 'name',
          'qty',  v_listing.qty
        )
      );
    END IF;

    v_buyer_save := jsonb_set(v_buyer_save, '{inventory,items}', v_new_arr);

  ELSIF v_listing.item_type = 'card' THEN

    v_item_id := v_snapshot ->> 'cardId';
    v_found   := false;
    v_new_arr := '[]'::jsonb;
    v_len     := jsonb_array_length(v_buyer_save -> 'cards' -> 'inventory');

    FOR v_i IN 0 .. v_len - 1 LOOP
      v_elem := v_buyer_save -> 'cards' -> 'inventory' -> v_i;
      IF v_elem ->> 'cardId' = v_item_id THEN
        v_elem  := jsonb_set(v_elem, '{qty}',
                    to_jsonb((v_elem ->> 'qty')::int + v_listing.qty));
        v_found := true;
      END IF;
      v_new_arr := v_new_arr || jsonb_build_array(v_elem);
    END LOOP;

    IF NOT v_found THEN
      v_new_arr := v_new_arr || jsonb_build_array(
        jsonb_build_object('cardId', v_item_id, 'qty', v_listing.qty)
      );
    END IF;

    v_buyer_save := jsonb_set(v_buyer_save, '{cards,inventory}', v_new_arr);

  END IF;

  -- 扣買家 gold
  v_buyer_save := jsonb_set(
    v_buyer_save,
    '{inventory,gold}',
    to_jsonb(v_gold - v_listing.price)
  );

  -- 寫回買家存檔
  UPDATE player_saves
  SET save_data  = v_buyer_save,
      updated_at = now()
  WHERE user_id = p_buyer_user_id;

  -- 結單
  UPDATE market_listings
  SET status  = 'sold',
      sold_at = now()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 讓 anon / authenticated 可以呼叫此 RPC
GRANT EXECUTE ON FUNCTION buy_listing(uuid, uuid) TO authenticated;
