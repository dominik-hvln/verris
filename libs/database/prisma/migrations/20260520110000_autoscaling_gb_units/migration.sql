-- Price RAM/DISK per GB (was per MB). Preserve effective hourly rates.
UPDATE "AutoscalingPriceRule"
SET
  unit = 'ram_gb',
  "pricePerUnit" = "pricePerUnit" * 1024,
  "thresholdAbove" = CASE
    WHEN "thresholdAbove" > 0 THEN CEIL("thresholdAbove"::numeric / 1024)::integer
    ELSE 0
  END
WHERE resource = 'RAM' AND unit = 'ram_mb';

UPDATE "AutoscalingPriceRule"
SET
  unit = 'disk_gb',
  "pricePerUnit" = "pricePerUnit" * 1024,
  "thresholdAbove" = CASE
    WHEN "thresholdAbove" > 0 THEN CEIL("thresholdAbove"::numeric / 1024)::integer
    ELSE 0
  END
WHERE resource = 'DISK' AND unit = 'disk_mb';
