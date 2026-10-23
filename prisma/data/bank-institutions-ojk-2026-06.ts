/*
  Official Indonesian bank catalog seed data (T-011 / A-52, A-53, A-58).

  Source: OJK "Daftar Alamat Kantor Pusat Bank Umum dan Syariah" page
  https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx
  File:   "Daftar Alamat Kantor Pusat Bank Umum Dan Syariah - Juni 2026.xlsx"
  SHA-256: 4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50

  Parsed from worksheet "Daftar Bank Umum" (columns A:F, rows 1..110).
  105 named bank rows across four OJK groups:
  - BANK UMUM PERSERO (4)
  - BANK UMUM SWASTA NASIONAL (67; includes the OJK-listed Bank Umum Syariah)
  - BANK PEMBANGUNAN DAERAH (27)
  - KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI (7)

  The workbook states only the month "Juni 2026", so provenance is recorded at
  month level (`sourcePeriod = "2026-06"`). No publication day is inferred. The
  actual import timestamp is the row's `created_at` / `updated_at`.

  Footnote markers such as "1)" are OJK annotations, not part of the bank name,
  and were stripped. No aliases, abbreviations, logos, or mockup names were added.

  DO NOT EDIT BY HAND. Regenerate from a verified OJK workbook with
  prisma/scripts/parse-ojk-workbook.ts and review the diff.
*/

export const BANK_INSTITUTION_SOURCE_URL =
  "https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx";

export const BANK_INSTITUTION_SOURCE_FILE =
  "Daftar Alamat Kantor Pusat Bank Umum Dan Syariah - Juni 2026.xlsx";

export const BANK_INSTITUTION_SOURCE_SHA256 =
  "4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50";

/** Publication period as stated by the source, never a synthesized day. */
export const BANK_INSTITUTION_SOURCE_PERIOD = "2026-06";

export const BANK_INSTITUTION_SEED_VERSION = "ojk-office-list-2026-06-v1";

export const OJK_GROUP_PERSERO = "BANK UMUM PERSERO";
export const OJK_GROUP_SWASTA = "BANK UMUM SWASTA NASIONAL";
export const OJK_GROUP_BPD = "BANK PEMBANGUNAN DAERAH";
export const OJK_GROUP_FOREIGN_BRANCH = "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI";

export type BankInstitutionSeedEntry = {
  /** OJK "Sandi Bank" (stable bank code) used as the seed match key. */
  code: string;
  /** Official display name exactly as published, minus OJK footnote markers. */
  name: string;
  /** OJK section the row belongs to; provenance only, not a product field. */
  group: string;
};

export const BANK_INSTITUTION_SEED: readonly BankInstitutionSeedEntry[] = [
  { code: "002", name: "PT BANK RAKYAT INDONESIA (PERSERO) Tbk", group: "BANK UMUM PERSERO" },
  { code: "008", name: "PT BANK MANDIRI (PERSERO) Tbk", group: "BANK UMUM PERSERO" },
  { code: "009", name: "PT BANK NEGARA INDONESIA (PERSERO) Tbk", group: "BANK UMUM PERSERO" },
  { code: "200", name: "PT BANK TABUNGAN NEGARA (PERSERO) Tbk", group: "BANK UMUM PERSERO" },
  { code: "011", name: "PT BANK DANAMON INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "013", name: "PT BANK PERMATA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "014", name: "PT BANK CENTRAL ASIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "016", name: "PT BANK MAYBANK INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "019", name: "PT BANK PAN INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "022", name: "PT BANK CIMB NIAGA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "023", name: "PT BANK UOB INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "028", name: "PT BANK OCBC NISP Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "037", name: "PT BANK ARTHA GRAHA INTERNASIONAL Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "076", name: "PT BANK BUMI ARTA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "087", name: "PT BANK HSBC INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "095", name: "PT BANK JTRUST INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "097", name: "PT BANK MAYAPADA INTERNATIONAL Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "146", name: "PT BANK OF INDIA INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "147", name: "PT BANK MUAMALAT INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "151", name: "PT BANK MESTIKA DHARMA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "152", name: "PT BANK SHINHAN INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "153", name: "PT BANK SINARMAS Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "157", name: "PT BANK KASIKORN INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "161", name: "PT BANK GANESHA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "164", name: "PT BANK ICBC INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "167", name: "PT BANK QNB INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "212", name: "PT BANK WOORI SAUDARA INDONESIA 1906 Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "426", name: "PT BANK MEGA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "441", name: "PT BANK KB INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "451", name: "PT BANK SYARIAH INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "484", name: "PT BANK KEB HANA INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "485", name: "PT BANK MNC INTERNASIONAL Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "494", name: "PT BANK RAYA INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "498", name: "PT BANK SBI INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "506", name: "PT BANK MEGA SYARIAH", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "555", name: "PT BANK INDEX SELINDO", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "553", name: "PT BANK HIBANK INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "036", name: "PT BANK CHINA CONSTRUCTION BANK INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "046", name: "PT BANK DBS INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "047", name: "PT BANK RESONA PERDANIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "048", name: "PT BANK MIZUHO INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "054", name: "PT BANK CAPITAL INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "057", name: "PT BANK BNP PARIBAS INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "061", name: "PT BANK ANZ INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "945", name: "PT BANK IBK INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "947", name: "PT BANK ALADIN SYARIAH Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "949", name: "PT BANK CTBC INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "213", name: "PT BANK SMBC INDONESIA, Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "253", name: "PT BANK NANO SYARIAH", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "405", name: "PT BANK SYARIAH NASIONAL", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "425", name: "PT BANK JABAR BANTEN SYARIAH", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "459", name: "PT KROM BANK INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "472", name: "PT BANK SAQU INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "490", name: "PT BANK NEO COMMERCE Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "501", name: "PT BANK DIGITAL BCA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "503", name: "PT BANK NATIONALNOBU Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "513", name: "PT BANK INA PERDANA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "517", name: "PT BANK PANIN DUBAI SYARIAH Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "521", name: "PT BANK KB BUKOPIN SYARIAH", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "523", name: "PT BANK SAHABAT SAMPOERNA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "526", name: "PT BANK OKE INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "531", name: "PT BANK AMAR INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "535", name: "PT BANK SEABANK INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "536", name: "PT BANK BCA SYARIAH", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "542", name: "PT BANK JAGO TBK", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "547", name: "PT BANK BTPN SYARIAH Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "548", name: "PT BANK MULTIARTA SENTOSA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "562", name: "PT SUPER BANK INDONESIA", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "564", name: "PT BANK MANDIRI TASPEN", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "566", name: "PT BANK VICTORIA INTERNATIONAL Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "567", name: "PT ALLO BANK INDONESIA Tbk", group: "BANK UMUM SWASTA NASIONAL" },
  { code: "110", name: "PT BPD JAWA BARAT DAN BANTEN Tbk", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "111", name: "PT BPD DKI", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "112", name: "PT BPD DAERAH ISTIMEWA YOGYAKARTA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "113", name: "PT BPD JAWA TENGAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "114", name: "PT BPD JAWA TIMUR Tbk", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "115", name: "PT BPD JAMBI", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "116", name: "PT BANK ACEH SYARIAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "117", name: "PT BPD SUMATERA UTARA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "118", name: "PT BANK NAGARI", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "119", name: "PT BPD RIAU KEPRI SYARIAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "120", name: "PT BPD SUMATERA SELATAN DAN BANGKA BELITUNG", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "121", name: "PT BPD LAMPUNG", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "122", name: "PT BPD KALIMANTAN SELATAN", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "123", name: "PT BPD KALIMANTAN BARAT", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "124", name: "PT BPD KALIMANTAN TIMUR DAN KALIMANTAN UTARA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "125", name: "PT BPD KALIMANTAN TENGAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "126", name: "PT BPD SULAWESI SELATAN DAN SULAWESI BARAT", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "127", name: "PT BPD SULAWESI UTARA DAN GORONTALO", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "128", name: "PT BANK NTB SYARIAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "129", name: "PT BANK PEMBANGUNAN DAERAH BALI", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "130", name: "PT BPD NUSA TENGGARA TIMUR", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "131", name: "PT BPD MALUKU DAN MALUKU UTARA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "132", name: "PT BPD PAPUA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "133", name: "PT BPD BENGKULU", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "134", name: "PT BPD SULAWESI TENGAH", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "135", name: "PT BPD SULAWESI TENGGARA", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "137", name: "PT BPD BANTEN Tbk", group: "BANK PEMBANGUNAN DAERAH" },
  { code: "031", name: "CITIBANK, N.A.", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "032", name: "JP MORGAN CHASE BANK, NA", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "033", name: "BANK OF AMERICA, N.A", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "042", name: "MUFG BANK, LTD", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "050", name: "STANDARD CHARTERED BANK", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "067", name: "DEUTSCHE BANK AG", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
  { code: "069", name: "BANK OF CHINA (HONG KONG) LIMITED", group: "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI" },
];
