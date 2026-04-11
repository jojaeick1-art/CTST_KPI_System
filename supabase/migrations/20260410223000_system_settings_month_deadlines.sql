-- system_settings.quarter 레거시 분기 키(1Q~4Q)를 월 키(M1~M12)로 이관
-- 목적: 설정 화면의 월별 마감값과 DB 키를 일치시켜 조회/저장 경로를 단순화

-- 1) 레거시 분기 키를 월 키로 확장 저장
WITH legacy_quarters AS (
  SELECT
    quarter,
    input_deadline,
    CASE
      WHEN quarter ~* '1\s*Q' THEN 1
      WHEN quarter ~* '2\s*Q' THEN 2
      WHEN quarter ~* '3\s*Q' THEN 3
      WHEN quarter ~* '4\s*Q' THEN 4
      ELSE NULL
    END AS qn
  FROM public.system_settings
)
INSERT INTO public.system_settings (quarter, input_deadline)
SELECT
  'M' || m.month_no AS quarter,
  l.input_deadline
FROM legacy_quarters l
JOIN (
  VALUES
    (1, 1), (1, 2), (1, 3),
    (2, 4), (2, 5), (2, 6),
    (3, 7), (3, 8), (3, 9),
    (4, 10), (4, 11), (4, 12)
) AS m(qn, month_no)
  ON m.qn = l.qn
WHERE l.qn IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.system_settings s
    WHERE s.quarter = 'M' || m.month_no
  );

-- 2) 이미 월 키가 있는 경우는 값을 유지하되, 비어 있는 값(null)만 레거시 분기값으로 보강
WITH legacy_quarters AS (
  SELECT
    quarter,
    input_deadline,
    CASE
      WHEN quarter ~* '1\s*Q' THEN 1
      WHEN quarter ~* '2\s*Q' THEN 2
      WHEN quarter ~* '3\s*Q' THEN 3
      WHEN quarter ~* '4\s*Q' THEN 4
      ELSE NULL
    END AS qn
  FROM public.system_settings
)
UPDATE public.system_settings s
SET input_deadline = l.input_deadline
FROM legacy_quarters l
JOIN (
  VALUES
    (1, 1), (1, 2), (1, 3),
    (2, 4), (2, 5), (2, 6),
    (3, 7), (3, 8), (3, 9),
    (4, 10), (4, 11), (4, 12)
) AS m(qn, month_no)
  ON m.qn = l.qn
WHERE l.qn IS NOT NULL
  AND s.quarter = 'M' || m.month_no
  AND s.input_deadline IS NULL;

-- 3) 레거시 분기 키 정리
DELETE FROM public.system_settings
WHERE quarter ~* '^[0-9]{2}Y\s*[1-4]\s*Q$'
   OR quarter ~* '^[1-4]\s*Q$';
