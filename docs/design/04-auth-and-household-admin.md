# Authentication & Family Member Management Flow

## 1. Invite-Only Architecture & Philosophy
The Financial Planner operates on a **"One Big Ledger" (Invite-Only)** model. A family shares one unified record so everyone can contribute expenses and see savings goals. Random users who sign up cannot see or tamper with family data until explicitly vetted.

### Roles & Access:
1. **Pemilik keluarga (Owner):** The person who created the family. Can approve/decline pending members and manage access. Permanent deletion is deferred from the MVP.
2. **Anggota (Member):** Approved family member or housemate. Can add transactions, scan receipts, view charts, and soft-delete entries they made.
3. **Menunggu persetujuan (Pending):** Authenticated via email/password, but awaiting approval from the Owner.

> UI copy uses plain language only. Technical terms such as ledger, JWT, session, and admin never appear in user-facing text (A-30).

---

## 2. Authentication Screens

### 2.1. Login / Sign Up Card
- **Layout:** Centered card (`max-w-md w-full rounded-3xl bg-white p-8 shadow-bento border border-slate-100`).
- **Header:** Playful brand logo (`✦ Financial Planner`) with welcoming subtitle *"Keuangan keluarga jadi lebih mudah."*
- **Segmented Control:** `[ Masuk (pill) ]  [ Buat akun ]`.
- **Inputs:**
  - Email (`rounded-2xl border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100`).
  - Password with show/hide eye toggle (min 8 characters).
  - **Kode undangan (opsional):** a single optional field. There is no "Household Name" field on signup.
- **Primary CTA:** Pill button `[ Buat akun keluarga ]` on the signup tab, `[ Masuk ]` on the login tab (`bg-slate-900 text-white rounded-full py-3.5`).
- **Helper text:** *"Punya kode undangan? Masukkan untuk bergabung ke keluarga yang sudah ada. Tanpa kode, kamu akan membuat keluarga baru."*

---

## 3. "Menunggu Persetujuan" State (Waiting Room)

When a user signs up to join an existing family, they are placed in a friendly, reassuring waiting room rather than being hit with a cold 403 screen.

### 3.1. Wireframe
```
+--------------------------------------------------------+
|                      Planner ✦                         |
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
- **Visuals:** Warm pastel peach & lavender background gradient (`from-orange-50 via-purple-50 to-white`).
- **Friendly Icon:** 3D house illustration or emoji badge with a soft floating bounce animation.
- **Status Pill:** Amber badge `bg-amber-100 text-amber-800 font-medium px-4 py-1.5 rounded-full inline-flex items-center gap-2`.
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
| Soft Amber Gradient (from-amber-100/60 to-orange-50/50 rounded-3xl p-6)    |
|                                                                             |
| (Avatar)  Sarah Miller                                                      |
|           sarah@gmail.com • Diminta 15 menit lalu                           |
|                                                                             |
|           Aksi:  [ ✅ Izinkan bergabung (pill) ]   [ ✕ Tolak (pill) ]       |
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
| Soft Sky Blue Gradient (from-sky-100/60 to-blue-50/40 rounded-3xl p-6)      |
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

