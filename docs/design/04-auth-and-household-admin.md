# Authentication & Family Member Management Flow

> **Canonical status:** Business behavior remains PM-approved; visual refresh PM-approved for T-010 (2026-10-20). Business behavior (invite-only, waiting room, DECLINED/REVOKED, Owner management, read-only member view) is unchanged. Updated 2026-10-20 by the UI/UX Designer: backgrounds, status pill contrast, and CTA colors restyled to the blue-white-green tokens (doc 01); peach/lavender/purple references retired (amber kept as a status color only, in contrast-compliant pairs). Tickets: T-010 (visual refresh).

## 1. Invite-Only Architecture & Philosophy
The Financial Diary operates on a **"One Big Ledger" (Invite-Only)** model. A family shares one unified record so everyone can contribute expenses and see savings goals. Random users who sign up cannot see or tamper with family data until explicitly vetted.

### Roles & Access:
1. **Pemilik keluarga (Owner):** The person who created the family. Can approve/decline pending members and manage access. Permanent deletion is deferred from the MVP.
2. **Anggota (Member):** Approved family member or housemate. Can add transactions, scan receipts, view charts, and soft-delete entries they made.
3. **Menunggu persetujuan (Pending):** Authenticated via email/password, but awaiting approval from the Owner.

> UI copy uses plain language only. Technical terms such as ledger, JWT, session, and admin never appear in user-facing text (A-30).

---

## 2. Authentication Screens

### 2.1. Login / Sign Up Card
- **Layout:** Centered card (`max-w-md w-full rounded-3xl bg-white p-8 shadow-bento border border-slate-100`).
- **Header:** product name as plain text (`Financial Diary`; no invented logo, icon, or mark, matching the actual auth screen and the auth mockup), with welcoming subtitle *"Keuangan keluarga jadi lebih mudah."*
- **Segmented Control:** `[ Masuk (pill) ]  [ Buat akun ]`.
- **Inputs:**
  - Email (`rounded-2xl border-[#E2E8F0] focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15`).
  - Password with show/hide eye toggle (min 8 characters).
  - **Kode undangan (opsional):** a single optional field. There is no "Household Name" field on signup.
- **Primary CTA:** Pill button `[ Buat akun keluarga ]` on the signup tab, `[ Masuk ]` on the login tab (`bg-[#166534] text-white rounded-full py-3.5`; primary action green, doc 01 §5.1).
- **Helper text:** *"Punya kode undangan? Masukkan untuk bergabung ke keluarga yang sudah ada. Tanpa kode, kamu akan membuat keluarga baru."*

---

## 3. "Menunggu Persetujuan" State (Waiting Room)

When a user signs up to join an existing family, they are placed in a friendly, reassuring waiting room rather than being hit with a cold 403 screen.

### 3.1. Wireframe
```
+--------------------------------------------------------+
|                      Financial Diary                         |
+--------------------------------------------------------+
|                                                        |
|   +------------------------------------------------+   |
|   |                  🏡 ⏳ ✨                       |   |
|   |           Tunggu sebentar, Sarah!              |   |
|   |                                                |   |
|   |   Permintaanmu untuk bergabung dengan          |   |
|   |   "Kel. Miller" sudah dikirim.                 |   |
|   |                                                |   |
|   |   STATUS:  [ 🟡 Menunggu persetujuan pemilik ]  |   |
|   |                                                |   |
|   |   Agar keuangan keluarga tetap aman dan        |   |
|   |   private, pemilik keluarga perlu menyetujui   |   |
|   |   aksesmu.                                     |   |
|   |                                                |   |
|   |   +----------------------------------------+   |   |
|   |   |   [ 🔄 Periksa lagi (Pill Button) ]     |   |   |
|   |   +----------------------------------------+   |   |
|   |                                                |   |
|   |   [ Keluar ]                                   |   |
|   +------------------------------------------------+   |
|                                                        |
+--------------------------------------------------------+
```

### 3.2. Design Specifications
- **Visuals:** Light blue-white background (`bg-[#F1F5FA]` canvas with a `#FFFFFF` card, hairline `#E2E8F0`; the former warm peach-and-lavender gradient is retired, doc 01 §2.5).
- **Friendly Icon:** friendly house badge in a circular blue tint well (`bg-[#DCEBFA] text-[#1D4F87]`); static, no floating bounce unless `prefers-reduced-motion` is honored.
- **Status Pill:** amber status tint `bg-[#FDF3D7] text-[#8A5A00] font-medium px-4 py-1.5 rounded-full inline-flex items-center gap-2` with icon + label (amber is a status color, not brand; measured readable pair 5.36:1, doc 01 §2.3).
- **Polling (A-29):** a manual `[ Periksa lagi ]` button plus exactly one automatic re-check. No continuous polling.
- **Privacy (A-29):** the owner's email is NOT shown. No "contact the owner" address.
- **Status announcement (A-29):** status changes are announced via `aria-live="polite"` on the status pill.

### 3.3. DECLINED / REVOKED variants
The same layout is reused with different copy and a single action. There is no re-request button (rejoin is deferred post-MVP).

- **DECLINED:** icon 🚫, title *"Permintaanmu belum disetujui"*, body *"Pemilik keluarga belum menyetujui aksesmu. Kamu bisa menghubungi mereka secara langsung."* Only action: `[ Keluar ]`.
- **REVOKED:** icon 🔒, title *"Aksesmu dihentikan"*, body *"Aksesmu ke keluarga ini sudah dihentikan oleh pemilik."* Only action: `[ Keluar ]`.

---

## 4. Owner Management View (Family page)

The Owner has access to a dedicated **Keluarga** tab in the navigation.

### 4.1. Wireframe & Bento Layout
```
+-----------------------------------------------------------------------------+
| Kelola keluarga: Kel. Miller                            [ + Undang anggota ] |
+-----------------------------------------------------------------------------+

+-----------------------------------------------------------------------------+
| BENTO CARD A: Permintaan bergabung (1 permintaan)                           |
| White card (bg-white rounded-3xl p-6 border border-[#E2E8F0]);              |
| tiap baris memakai chip status amber tint (Menunggu persetujuan) dengan    |
| ikon + label; amber adalah warna status, bukan warna bagian (doc 01 §2.3)  |
|                                                                             |
| (Avatar)  Sarah Miller                                                      |
|           sarah@gmail.com • Diminta 15 menit lalu                           |
|                                                                             |
|           Aksi:  [ ✅ Izinkan bergabung ]   [ ✕ Tolak ]
+-----------------------------------------------------------------------------+

+-----------------------------------------------------------------------------+
| BENTO CARD B: Anggota aktif (3 anggota)                                     |
| White Card (bg-white rounded-3xl p-6 border border-slate-100)               |
|                                                                             |
| 1. (Avatar) Alex Miller (Kamu)         [ 👑 Pemilik keluarga ]              |
|    alex@millerfamily.com • Bergabung Jan 2026                               |
|                                                                             |
| 2. (Avatar) Emma Miller                [ Anggota ]       [ ⋯ menu ]         |
|    emma@millerfamily.com • Bergabung Feb 2026                               |
|                                                                             |
| 3. (Avatar) Liam Miller                [ Anggota ]       [ ⋯ menu ]         |
|    liam@millerfamily.com • Bergabung Mar 2026                               |
+-----------------------------------------------------------------------------+

+-----------------------------------------------------------------------------+
| BENTO CARD C: Keamanan keluarga                                             |
| Blue tint well (bg-[#DCEBFA] rounded-3xl p-6, teks navy #14273F)            |
|                                                                             |
| 🔒 Item terhapus tetap di Trash sampai dipulihkan                           |
| 🔑 Akses diperiksa ulang di setiap permintaan                               |
+-----------------------------------------------------------------------------+
```

### 4.2. Approval Micro-Interactions
- **Approve Tap:**
  - Button transitions to a checkmark spinner: `bg-emerald-600 text-white`.
  - The pending row smoothly shifts into the active members list with a subtle green flash animation.
  - A toast notifies: *"Sarah Miller sekarang menjadi anggota keluarga ini."*
- **Deny Tap:**
  - Confirmation pill popover: *"Tolak permintaan dari Sarah? Mereka tidak akan bisa melihat keuangan keluarga ini."*
  - On confirm, smoothly fades row out.

### 4.3. Revoke access (Owner)
- Each active member row (except the Owner) has a `⋯` menu. The menu contains a single destructive item: **"Hapus akses"**.
- Selecting it opens a confirmation popover: *"Hapus akses Emma? Mereka tidak akan bisa melihat keuangan keluarga ini lagi."* with `[ Hapus akses ]` (destructive) and `[ Batal ]`.
- On confirm, the member moves out of the active list and their access ends on their next protected request.

### 4.4. Member view (read-only)
- A MEMBER opening the Family page sees a read-only list of members: avatar, name, role badge, join date.
- No invite button, no approve/decline/revoke controls, no `⋯` menu. Members cannot manage access.

---

## 5. Profile page (`/profile`)

A minimal page reachable from the avatar. It shows:
- Display name.
- Family name.
- Membership status (e.g. `Anggota`, `Pemilik keluarga`).
- A single `[ Keluar ]` button (logout).

No extra configuration and no destructive account actions in the MVP.
