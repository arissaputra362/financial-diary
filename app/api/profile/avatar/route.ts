import { NextResponse } from "next/server";
import { authenticatedRequest } from "@/lib/server/auth";
import { badRequest } from "@/lib/server/errors";
import { respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { createVercelBlobStore } from "@/lib/server/providers/blob";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PRESET_AVATARS: Record<string, string> = {
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#DCFCE7"/><path d="M64 96V57" stroke="#166534" stroke-width="8" stroke-linecap="round"/><path d="M62 65C35 68 19 52 21 24c29-1 48 15 41 41Z" fill="#27B978"/><path d="M66 61c4-29 23-43 50-40-3 29-20 45-50 40Z" fill="#0B8F62"/></svg>`,
  finny: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#DCEBFA"/><circle cx="64" cy="69" r="37" fill="#FFF1A8"/><path d="M64 35V19" stroke="#166534" stroke-width="7" stroke-linecap="round"/><path d="M62 30C43 32 31 22 32 8c20 0 32 10 30 22Z" fill="#27B978"/><path d="M67 28c3-18 15-27 31-25-2 18-13 28-31 25Z" fill="#0B8F62"/><circle cx="51" cy="67" r="4" fill="#6C581B"/><circle cx="77" cy="67" r="4" fill="#6C581B"/><path d="M53 82c7 7 15 7 22 0" stroke="#9B6A13" stroke-width="5" stroke-linecap="round"/></svg>`,
  ocean: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#DCEBFA"/><circle cx="64" cy="64" r="36" fill="#1D4F87"/><path d="M31 70c19 15 37 15 56 0 5-4 8-7 11-12v27c-19 18-49 18-68 0V58c3 5 6 8 11 12Z" fill="#A6C7EA"/><circle cx="52" cy="57" r="5" fill="#F1F5FA"/><circle cx="76" cy="57" r="5" fill="#F1F5FA"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#FDF3D7"/><circle cx="64" cy="64" r="28" fill="#F9C744"/><path d="M64 20v12M64 96v12M20 64h12M96 64h12M33 33l9 9M86 86l9 9M95 33l-9 9M42 86l-9 9" stroke="#D97706" stroke-width="7" stroke-linecap="round"/><path d="M51 69c8 7 18 7 26 0" stroke="#8A5A00" stroke-width="5" stroke-linecap="round"/></svg>`,
  woman: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#FCE7F3"/><path d="M30 108c3-25 16-39 34-39s31 14 34 39" fill="#DB2777"/><circle cx="64" cy="53" r="26" fill="#F6C7A8"/><path d="M38 52c-4-25 9-39 28-39 22 0 30 18 24 40l-8-16c-13 8-27 10-42 6l-2 9Z" fill="#4B2630"/><circle cx="54" cy="54" r="3" fill="#3B2730"/><circle cx="74" cy="54" r="3" fill="#3B2730"/><path d="M57 66c5 4 9 4 14 0" stroke="#A64B5D" stroke-width="4" stroke-linecap="round"/></svg>`,
  man: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#DBEAFE"/><path d="M29 108c3-25 16-39 35-39s32 14 35 39" fill="#1D4F87"/><circle cx="64" cy="53" r="26" fill="#D99B72"/><path d="M38 48c0-23 11-35 28-35 18 0 27 12 25 31-13-8-28-10-47-1l-6 5Z" fill="#263238"/><circle cx="54" cy="54" r="3" fill="#263238"/><circle cx="74" cy="54" r="3" fill="#263238"/><path d="M56 67c6 4 10 4 16 0" stroke="#854D3B" stroke-width="4" stroke-linecap="round"/></svg>`,
  boy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#E0F2FE"/><path d="M34 108c2-20 13-32 30-32s28 12 30 32" fill="#0284C7"/><circle cx="64" cy="55" r="24" fill="#E7B084"/><path d="M40 49c2-21 12-31 27-31 13 0 23 8 24 24-16-5-32-3-51 7Z" fill="#5B3A29"/><circle cx="55" cy="56" r="3" fill="#263238"/><circle cx="73" cy="56" r="3" fill="#263238"/><path d="M57 68c5 4 9 4 14 0" stroke="#985443" stroke-width="4" stroke-linecap="round"/></svg>`,
  girl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#F3E8FF"/><path d="M33 108c2-20 14-32 31-32s29 12 31 32" fill="#A855F7"/><circle cx="64" cy="55" r="24" fill="#F1C4A5"/><path d="M39 54c-5-23 8-38 26-38 19 0 29 15 24 39l-8-11c-13 7-26 7-40 1l-2 9Z" fill="#713F5A"/><circle cx="55" cy="56" r="3" fill="#3B2730"/><circle cx="73" cy="56" r="3" fill="#3B2730"/><path d="M57 68c5 4 9 4 14 0" stroke="#A64B5D" stroke-width="4" stroke-linecap="round"/></svg>`,
};

function styledPreset(id: string): string {
  const palettes: Record<string, [string, string, string]> = {
    leaf: ["#E5F8ED", "#20B477", "#087F5B"],
    finny: ["#FFF4C7", "#F8C84A", "#E68A19"],
    ocean: ["#E3F5F7", "#45C5D1", "#147B9A"],
    sun: ["#FFF2C9", "#F7B92F", "#E17817"],
    woman: ["#FFE8F1", "#F08BB5", "#B94378"],
    man: ["#E7F0FF", "#78A9E8", "#3567A8"],
    boy: ["#E5F5FF", "#59B9E8", "#16739F"],
    girl: ["#F3EAFF", "#B68AEF", "#7046A8"],
  };
  const [background, primary, dark] = palettes[id] ?? palettes.finny;
  const human = ["woman", "man", "boy", "girl"].includes(id);
  const hair = id === "woman" || id === "girl" ? "#533047" : "#263238";
  const skin = id === "man" || id === "boy" ? "#D99B72" : "#F2C2A3";
  const face = human
    ? `<path d="M31 111c3-24 16-37 33-37s30 13 33 37" fill="url(#shirt)"/><circle cx="64" cy="54" r="25" fill="${skin}"/><path d="M39 51c-3-23 9-37 27-37 20 0 29 15 24 39l-9-13c-13 8-27 9-42 5Z" fill="${hair}"/><circle cx="54" cy="55" r="3" fill="#263238"/><circle cx="74" cy="55" r="3" fill="#263238"/><path d="M56 68c5 5 11 5 16 0" fill="none" stroke="#9D5960" stroke-width="4" stroke-linecap="round"/>`
    : id === "leaf"
      ? `<path d="M64 96V57" stroke="${dark}" stroke-width="8" stroke-linecap="round"/><path d="M62 65C35 68 19 52 21 24c29-1 48 15 41 41Z" fill="url(#accent)"/><path d="M66 61c4-29 23-43 50-40-3 29-20 45-50 40Z" fill="${dark}"/>`
      : id === "ocean"
        ? `<circle cx="64" cy="66" r="35" fill="url(#accent)"/><path d="M28 71c22 16 42 16 72 0v24c-19 18-53 18-72 0Z" fill="${dark}"/><circle cx="52" cy="58" r="5" fill="#fff"/><circle cx="76" cy="58" r="5" fill="#fff"/>`
        : id === "finny"
          ? `<path d="M64 48V29" stroke="${dark}" stroke-width="5" stroke-linecap="round"/><path d="M61 35C45 36 34 27 36 12c18 0 29 8 27 22Z" fill="url(#accent)"/><path d="M67 34c3-16 15-24 31-21-2 17-13 25-31 21Z" fill="${dark}"/><ellipse cx="64" cy="72" rx="34" ry="31" fill="#F4E9BD" stroke="#D3C887" stroke-width="2"/><ellipse cx="49" cy="77" rx="7" ry="4" fill="#F4A59B" opacity=".65"/><ellipse cx="79" cy="77" rx="7" ry="4" fill="#F4A59B" opacity=".65"/><circle cx="53" cy="67" r="4" fill="#253B35"/><circle cx="75" cy="67" r="4" fill="#253B35"/><path d="M56 80c5 7 11 7 16 0" fill="none" stroke="#253B35" stroke-width="4" stroke-linecap="round"/><path d="M35 88c-8 5-10 12-5 17M93 87c8 5 10 12 5 17" fill="none" stroke="#198A62" stroke-width="8" stroke-linecap="round"/><circle cx="98" cy="99" r="16" fill="#F5B82E" stroke="#D98A16" stroke-width="3"/><text x="98" y="104" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#fff">Rp</text>`
        : `<circle cx="64" cy="66" r="29" fill="url(#accent)"/><path d="M64 24v10M64 98v10M22 66h10M96 66h10M35 37l8 8M85 85l8 8M93 37l-8 8M43 85l-8 8" stroke="${dark}" stroke-width="7" stroke-linecap="round"/><path d="M52 72c8 7 16 7 24 0" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="bg" x1="20" y1="10" x2="105" y2="120" gradientUnits="userSpaceOnUse"><stop stop-color="${background}"/><stop offset="1" stop-color="#fff"/></linearGradient><linearGradient id="accent" x1="30" y1="20" x2="100" y2="105" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="${primary}"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="shirt" x1="30" y1="75" x2="95" y2="115" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="${primary}"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="${dark}" flood-opacity=".2"/></filter></defs><circle cx="64" cy="64" r="61" fill="url(#bg)"/><circle cx="64" cy="64" r="47" fill="#fff" fill-opacity=".18" filter="url(#shadow)"/>${face}<ellipse cx="46" cy="28" rx="16" ry="7" fill="#fff" opacity=".45" transform="rotate(-25 46 28)"/></svg>`;
}

export function getPresetAvatarSvg(id: string): string | undefined {
  return ["leaf", "finny", "ocean", "sun", "woman", "man", "boy", "girl"].includes(id)
    ? styledPreset(id)
    : PRESET_AVATARS[id];
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    const formData = await request.formData();
    const preset = formData.get("preset");
    if (typeof preset === "string") {
      if (!getPresetAvatarSvg(preset)) throw badRequest("AVATAR_PRESET_INVALID", "Avatar pilihan tidak tersedia.");
      const updated = await session.auth.updateAvatar(session.userId, `preset:${preset}`, "image/svg+xml");
      const response = NextResponse.json(updated);
      await setSessionCookie(response, session.sessionId, session.userId);
      return response;
    }
    const value = formData.get("photo");
    if (!(value instanceof File)) throw badRequest("AVATAR_REQUIRED", "Pilih foto profil terlebih dahulu.");
    if (!ALLOWED_TYPES.has(value.type)) {
      throw badRequest("AVATAR_TYPE_INVALID", "Gunakan foto JPG, PNG, atau WebP.");
    }
    if (value.size === 0 || value.size > MAX_AVATAR_BYTES) {
      throw badRequest("AVATAR_SIZE_INVALID", "Ukuran foto maksimal 2 MB.");
    }

    const key = `avatars/${session.userId}`;
    await createVercelBlobStore().put(new Uint8Array(await value.arrayBuffer()), key, value.type);
    const updated = await session.auth.updateAvatar(session.userId, key, value.type);
    const response = NextResponse.json(updated);
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest();
    const requestedPreset = new URL(request.url).searchParams.get("preset");
    if (requestedPreset) {
      const svg = getPresetAvatarSvg(requestedPreset);
      if (!svg) return new NextResponse(null, { status: 404 });
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const avatar = await session.auth.getAvatar(session.userId);
    if (!avatar) return new NextResponse(null, { status: 404 });

    if (avatar.avatarKey.startsWith("preset:")) {
      const preset = avatar.avatarKey.slice("preset:".length);
      const svg = getPresetAvatarSvg(preset);
      if (!svg) return new NextResponse(null, { status: 404 });
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const stored = await createVercelBlobStore().get(avatar.avatarKey);
    if (!stored) return new NextResponse(null, { status: 404 });
    const response = new NextResponse(stored.stream);
    response.headers.set("Content-Type", avatar.avatarContentType);
    response.headers.set("Cache-Control", "private, max-age=300");
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
