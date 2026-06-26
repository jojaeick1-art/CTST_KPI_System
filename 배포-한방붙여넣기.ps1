# ============================================================
# CTST KPI 배포 — PowerShell에 한 번에 붙여넣기용
#
# 사용법
#   1) 아래 두 줄만 본인 환경에 맞게 수정
#   2) 이 파일 전체 선택(Ctrl+A) → 복사 → PowerShell 붙여넣기
#
# 사전 준비 (최초 1회)
#   - .env.local 존재 (없으면 .env.local.example 복사 후 API 키 입력)
#   - $env:SUPABASE_ACCESS_TOKEN 설정 (sbp_... 토큰)
# ============================================================

Set-Location "C:\Users\admin\Desktop\Project\C-ONE\CTST_KPISystem - 복사본"

npm ci
npm run build
git status
git add .
git commit -m "20260626_1 업데이트"
git push origin main
npx supabase@latest login --token $env:SUPABASE_ACCESS_TOKEN
npx supabase@latest link --project-ref kcwjtoespzeysycqkfzo
npx supabase@latest db push
