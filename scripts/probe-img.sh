#!/usr/bin/env bash
# 온비드 사진 주소의 크기 옵션 비교 (일회성 점검)
U='https://www.onbid.co.kr/op/cm/syc/filemng/filemngprcs/FileMngPrcsController/dnldFile.do?atchFileLstNo=17114763&atchSn=2&hashCrpsNo=APJAONJNCNOIBNOKBHAJOOGOFIBJHGFBLDFCINIKIFNAOCEPJJPBNHFOIINCDDGN'
for k in "&downloadImageKind=THNL_NM" "" "&downloadImageKind=ORGN_NM" "&downloadImageKind=ORG_NM" "&downloadImageKind=STRE_NM" "&downloadImageKind=MDL_NM"; do
  curl -sL -A 'Mozilla/5.0' -o /tmp/x "$U$k" -w "kind=[$k] code=%{http_code} type=%{content_type} bytes=%{size_download}\n"
  file /tmp/x | cut -c1-200
done
