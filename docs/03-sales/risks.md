# Risiko

## Produk
- False positive tinggi → churn cepat. Rules semgrep custom wajib ditest ketat terhadap app real sebelum launch (lihat [../01-product/mvp-scope.md](../01-product/mvp-scope.md)).
- Rules butuh maintenance seiring framework berubah (Next.js App Router vs Pages Router, versi SDK Supabase baru).

## Legal / reputasi
- Jangan publish nama app spesifik dari hasil scan tanpa izin eksplisit — bisa kena masalah hukum atau ngerusak trust calon pelanggan.
- Jangan klaim "100% aman" — security itu proses berkelanjutan, bukan sertifikat sekali scan.

## Kompetitif
- Kompetitor besar (Snyk, GitGuardian) bisa turun ke niche ini kapan aja. Diferensiasi lewat fokus "pola kesalahan AI-generated code" (Supabase RLS, Next.js auth-missing) harus tetap tajam dan terus di-update duluan dari mereka.

## Related
- Positioning buat pertahankan diferensiasi: [../02-marketing/positioning.md](../02-marketing/positioning.md)
