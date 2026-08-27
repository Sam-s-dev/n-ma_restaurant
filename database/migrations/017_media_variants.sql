-- =============================================================
-- 017 — Vignettes d'images
--
-- Les photos arrivent telles que l'appareil les produit : mesuré sur un
-- restaurant réel, neuf plats représentaient 4 Mo à charger pour un seul
-- écran de vente, dont une photo de 1,8 Mo affichée dans une vignette de
-- 100 points. Sur un réseau mobile à 1 Mbit/s, l'écran mettait une demi-
-- minute à se peindre et les cadres restaient gris.
--
-- On garde l'original intact — c'est la pièce d'archive, et le gérant
-- pourra vouloir la réutiliser plus tard — et on range à côté les versions
-- réduites, fabriquées une seule fois puis relues telles quelles.
-- =============================================================

CREATE TABLE media_variants (
  media_id    uuid        NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  -- Largeur demandée, en pixels. Le serveur n'accepte qu'une courte liste
  -- de valeurs (voir media.service.ts) : sans cela, une boucle sur
  -- ?w=1,2,3… suffirait à remplir la base.
  width       integer     NOT NULL CHECK (width BETWEEN 16 AND 2048),
  mime_type   text        NOT NULL,
  byte_size   integer     NOT NULL CHECK (byte_size > 0),
  checksum    text        NOT NULL,
  content     bytea       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (media_id, width),

  CONSTRAINT media_variants_mime_allowed
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

COMMENT ON TABLE media_variants IS
  'Versions réduites d''une image, fabriquées à la première demande puis conservées.';
