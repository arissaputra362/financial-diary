# Spec: Auth & Household Approval

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Draft
**PRD:** `docs/PRD.md#fitur-1-auth-household-approval`
**AC yang di-cover:** AC-1 s.d. AC-7 (Fitur 1) = AC-F1-1..AC-F1-7
**Flow referensi:** `docs/erd/flowcharts.md` §3

## Overview

Kontrol akses satu household ledger: user pertama menjadi Owner, anggota lain masuk
via invite dan harus di-approve Owner. Sesi berbasis JWT pendek + session database
yang bisa dicabut. Status keanggotaan divalidasi ulang pada setiap request protected.

## User Flow

1. User buka `/signup` → isi email, nama, password (tanpa invite) → jadi Owner → masuk `/home`.
2. Owner buka `/family` → buat invite → dapat kode sekali-pakai → bagikan ke anggota.
3. Anggota buka link invite → signup → status PENDING → lihat layar "Waiting Room".
4. Owner approve anggota di `/family` → anggota mendapat akses pada request berikutnya.
5. Anggota login → status menentukan tujuan: OPEN_HOME / WAIT_FOR_APPROVAL / SIGN_IN_AGAIN.
6. Owner decline/revoke anggota → akses hilang pada request protected berikutnya.

## Behavior Detail

### AC-1 (AC-F1-1): Signup tanpa invite membuka household baru (Owner)

- Kondisi: signup tanpa invite code, email belum terdaftar, password ≥ 8 karakter.
- Yang terjadi: user + household + membership (OWNER, APPROVED) dibuat dalam satu
  transaksi atomik; sesi dibuat; respons `nextAction: OPEN_HOME`. Tidak ada batas jumlah
  household yang bisa dibuka cara ini (kebijakan D-5: signup terbuka untuk membuka
  household baru; bergabung ke household existing wajib invite + approval).
- Yang tidak boleh terjadi: household tanpa membership OWNER; data ledger bocor di
  response signup; password < 8 karakter diterima.

### AC-2 (AC-F1-2): Signup via invite → PENDING

- Kondisi: invite code valid (hash match, belum redeemed, belum revoked, belum expired).
- Yang terjadi: user dibuat, invite di-redeem (conditional update anti-race),
  membership PENDING dibuat + event REQUESTED; respons `nextAction: WAIT_FOR_APPROVAL`.
- Yang tidak boleh terjadi: membership langsung APPROVED; invite bisa dipakai dua kali.

### AC-3 (AC-F1-3): Invite invalid ditolak dengan aman

- Kondisi: code salah/expired/revoked/sudah dipakai.
- Yang terjadi: 400 INVALID_INVITE dengan pesan bahasa awam yang seragam (keputusan
  rapat D-3: 400, bukan 409 — amandemen atas kalimat "409 invite" di arch-dec).
- Yang tidak boleh terjadi: response body berbeda per penyebab (QA assert kesetaraan
  body `code` + `message` untuk keempat penyebab); enumerasi code yang berhasil.

### AC-4 (AC-F1-4): Non-approved tidak bisa akses ledger

- Kondisi: membership PENDING/DECLINED/REVOKED memanggil route ledger.
- Yang terjadi: 403 dengan code `ACCESS_PENDING` / `ACCESS_DECLINED` / `ACCESS_REVOKED`.
  Route yang masih boleh HANYA: `GET /api/auth/me` dan `POST /api/auth/logout`;
  semua route `/api/*` lain (kecuali signup/login) menolak dengan 403 typed.
- Yang tidak boleh terjadi: data ledger apa pun di response; UI menampilkan halaman
  selain waiting room/status untuk user PENDING.

### AC-5 (AC-F1-5): Owner approve/decline/revoke + audit

- Kondisi: caller adalah OWNER di household yang sama; target status valid.
- Yang terjadi: transisi `PENDING→APPROVED`, `PENDING→DECLINED`, `APPROVED→REVOKED`;
  setiap aksi append membership_event (actor, timestamp, status lama→baru, reason opsional).
- Yang tidak boleh terjadi: transisi invalid (mis. DECLINED→APPROVED langsung) →
  409 INVALID_STATE_TRANSITION; OWNER jadi target decline/revoke via flow member;
  non-owner memanggil endpoint ini → 403.

### AC-6 (AC-F1-6): Sesi kedaluwarsa & logout (sliding session, D-1)

- Kondisi: JWT exp lewat, session revoked/expired di DB, atau user logout.
- Yang terjadi: JWT TTL 15 menit; setiap request protected yang lolos revalidasi
  me-reissue cookie JWT baru (sid sama) — sliding session. Sesi absolut 7 hari
  (`session.expires_at`); melewati 7 hari → 401 wajib login ulang. Logout mencabut
  session di DB (revoked_at) dan menghapus cookie. Login selalu membuat session row
  baru (sid baru — anti session fixation).
- Yang tidak boleh terjadi: JWT valid tapi session sudah revoked masih lolos; logout
  hanya menghapus cookie tanpa mencabut session server-side; ada route refresh terpisah
  (tidak ada — renewal terjadi otomatis via reissue).

### AC-7 (AC-F1-7): Revalidasi membership per request

- Kondisi: anggota baru saja di-approve / di-revoke.
- Yang terjadi: setiap request protected memuat ulang membership dari DB; akses berlaku
  sejak request pertama setelah approval; revoke berlaku sejak request berikutnya.
- Yang tidak boleh terjadi: cache status membership yang membuat revoke tertunda;
  JWT berisi `role` atau `household_id` (keputusan D-2: claims = `{sub, sid,
  token_version, iat, exp}`; role dan household selalu dari DB per request;
  `token_version` = konstanta "v1" di MVP).

## Edge Case

- Email dengan kapital/spasi berbeda → dinormalisasi (lowercase + trim) sebelum cek unik;
  plus-addressing (`user+tag@x.com`) dianggap email berbeda (aturan D-22).
- Signup email sudah terdaftar → 409 EMAIL_TAKEN, tanpa membocorkan household-nya.
- Password < 8 karakter → 422 dengan fieldErrors bahasa awam (kebijakan D-5).
- display_name > 60 karakter / kosong setelah trim → 422 (batas D-22).
- Dua request redeem invite bersamaan → hanya satu yang berhasil (conditional update).
- Dua signup user pertama bersamaan → keduanya sukses, masing-masing household sendiri.
- Session expired saat user sedang mengisi form → submit → 401 → data form tidak hilang
  (client menyimpan draft lokal).
- Owner mencoba revoke dirinya sendiri → ditolak.
- Approve/decline/revoke pada membership ber-role OWNER → 409 INVALID_STATE_TRANSITION,
  tanpa membership_event baru.
- Invite expired saat user sudah mengisi form signup → 400 INVALID_INVITE, form tetap terisi.
- User DECLINED/REVOKED login → hanya layar status + logout; tidak ada tombol re-request
  (rejoin ditunda pasca-MVP, keputusan D-4). Layar status DECLINED/REVOKED (varian
  Waiting Room dengan copy berbeda) didefinisikan di design doc 04 (sign-off UI/UX Designer).
- Waiting room PENDING: polling = tombol manual "Check again" + satu auto-recheck;
  email owner TIDAK ditampilkan (privasi, keputusan A-29); perubahan status diumumkan
  via aria-live polite.
- Logout di satu perangkat → hanya session itu yang dicabut; perangkat lain tetap aktif
  (revocation per-session).

## Constraint Bisnis

- Satu user hanya boleh punya satu membership aktif (PENDING/APPROVED) dalam MVP.
- Invite single-use, kedaluwarsa 7 hari, hanya hash yang disimpan.
- Audit log membership bersifat immutable dan tidak boleh diedit/dihapus (testable:
  tidak ada route PATCH/DELETE pada membership_event; tabel tanpa updated_at).
- Pesan error auth tidak boleh membedakan "email tidak ada" vs "password salah".
- Cookie sesi wajib HttpOnly, Secure, SameSite=Lax (AC eksplisit, QA assert header).
- Set-Cookie reissue pada sliding session memakai flag yang sama.

## Out of Scope

- Social login, reset password email, multi-household, role editor, rate limiting login
  lanjutan (backlog keamanan pasca-MVP).