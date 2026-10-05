# Dev Plan: [Nama Fitur]

Detail teknis implementasi. Ini dokumen utama yang dibaca Claude Code saat generate kode. Berisi semua keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-[nama].md`
- PRD: `docs/PRD.md#fitur-[nama]`
- ADR terkait: ADR-001, ADR-00N
- Engineer: [Nama] · Estimasi: [N] hari · Status: Draft

## Ringkasan Teknis

Pendekatan implementasi dalam 2-3 kalimat. Layer apa yang terdampak.

## Schema Database

### Tabel: [nama_tabel]

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK, UUIDv7 | |
| tenant_id | uuid | FK → tenants | |
| ... | ... | ... | |

Index: [kolom] — alasan index ini dibutuhkan

## Interface & Contract

### Repository Interface

- `findById(string $id): ?Model`
- `findByToken(string $token): ?Model`
- `create(array $data): Model`
- ... (hanya method yang dibutuhkan fitur ini)

### Service Interface

- `submit(array $data): Model`
- `trackByToken(string $token): Model`
- ...

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| /lapor | GET | Tidak | - | View: form |
| /lapor | POST | Tidak | category, content | Redirect + token |
| /pantau/{token} | GET | Tidak | - | View: status valid |

### Validasi Rules

| Field | Rules | Pesan error |
|---|---|---|
| category | required, in:[...] | Kategori tidak valid |
| content | required, string, min:20 | Minimal 20 karakter |

## Async & Queue

- Job: [NamaJob] — trigger: [kondisi], queue: [nama queue]
- Atau: tidak ada async untuk fitur ini

## Test Scenario (BDD)

### Unit (Service — mock Repository)

- it submits report and returns model with tracking token
- it throws exception when category is invalid

### Feature (Controller)

- it renders form for unauthenticated user
- it stores report and redirects with token on valid input
- it returns validation errors on invalid input
- it returns 404 when token is not found

### Integration

- it completes full anonymous report flow end-to-end

## Task Breakdown

### Database & Model

- [ ] Migration: sesuai §Schema Database
- [ ] Model: fillable, casts, relasi
- [ ] Factory untuk testing

### Repository

- [ ] Interface: sesuai §Repository Interface
- [ ] Implementasi Eloquent
- [ ] Binding di AppServiceProvider

### Service

- [ ] Interface: sesuai §Service Interface
- [ ] Implementasi
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Form Request: sesuai §Validasi Rules
- [ ] Controller: sesuai §HTTP Contract
- [ ] Routes di web.php
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Livewire component / View

### Async (jika ada)

- [ ] Job: sesuai §Async & Queue
- [ ] Integration test: sesuai §Test Scenario > Integration

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| (diisi saat coding berjalan) | | |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| (diisi saat coding berjalan) | | | |
