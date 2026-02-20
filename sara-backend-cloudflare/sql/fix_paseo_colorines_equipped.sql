-- Fix Paseo Colorines: price_equipped is NULL
-- These models need equipped prices (closets + cocina integral)
-- The markup for other developments averages ~5% over base price
--
-- IMPORTANT: Verify these prices with the sales team before executing.
-- Using ~5% markup estimate based on other developments.

UPDATE properties SET price_equipped = 3150529  -- ~5% over 3,000,504
WHERE name = 'Prototipo 6M' AND development = 'Paseo Colorines';

UPDATE properties SET price_equipped = 3740766  -- ~5% over 3,562,634
WHERE name = 'Prototipo 7M' AND development = 'Paseo Colorines';

-- Verify:
SELECT name, development, price, price_equipped,
  ROUND((price_equipped::numeric / price::numeric - 1) * 100, 1) as markup_pct
FROM properties
WHERE development = 'Paseo Colorines';
