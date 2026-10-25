import { NextResponse } from "next/server";
import { hasAtMostTwoDecimals } from "@/lib/money-input";
import { authenticatedRequest } from "@/lib/server/auth";
import { parseJson, respondError } from "@/lib/server/http";
import { setSessionCookie } from "@/lib/server/session";
import { GoldService } from "@/lib/server/services/gold";
import { GoldAssetType, GoldBrand, WalletScope } from "@/lib/generated/prisma/enums";
import type { CreateGoldAssetInput } from "@/types/gold";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");

    const filterScope =
      scopeParam === "PERSONAL"
        ? WalletScope.PERSONAL
        : scopeParam === "SHARING"
        ? WalletScope.SHARING
        : undefined;

    const summary = await GoldService.getPortfolioSummary(
      session.householdId,
      session.userId,
      filterScope
    );

    const response = NextResponse.json(summary, { status: 200 });
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authenticatedRequest({ approvedOnly: true });
    const body = await parseJson(request) as Partial<CreateGoldAssetInput>;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Nama aset emas wajib diisi" },
        { status: 422 }
      );
    }

    const weightGrams = Number(body.weightGrams);
    if (isNaN(weightGrams) || weightGrams <= 0) {
      return NextResponse.json(
        { error: "Berat emas harus lebih besar dari 0 gram" },
        { status: 422 }
      );
    }

    const buyPriceMinor = Number(body.buyPriceMinor);
    if (!hasAtMostTwoDecimals(buyPriceMinor) || buyPriceMinor < 0) {
      return NextResponse.json(
        { error: "Harga beli tidak boleh negatif" },
        { status: 422 }
      );
    }

    const type = body.type === GoldAssetType.JEWELRY ? GoldAssetType.JEWELRY : GoldAssetType.BULLION;
    const scope = body.scope === WalletScope.SHARING ? WalletScope.SHARING : WalletScope.PERSONAL;

    let brand: GoldBrand = GoldBrand.OTHER;
    if (body.brand && Object.values(GoldBrand).includes(body.brand)) {
      brand = body.brand;
    }

    const input: CreateGoldAssetInput = {
      name: body.name.trim(),
      type,
      scope,
      brand,
      brandCustomName: body.brandCustomName?.trim() || undefined,
      weightGrams,
      purityPermille: Number(body.purityPermille) || 999,
      serialNumber: body.serialNumber?.trim() || undefined,
      buyPriceMinor,
      purchaseDate: body.purchaseDate || new Date().toISOString().split("T")[0],
      notes: body.notes?.trim() || undefined,
      receiptId: body.receiptId || undefined,
    };

    const created = await GoldService.createAsset(
      session.householdId,
      session.userId,
      input
    );

    const response = NextResponse.json(
      { ...created, buyPriceMinor: Number(created.buyPriceMinor) },
      { status: 201 },
    );
    await setSessionCookie(response, session.sessionId, session.userId);
    return response;
  } catch (error) {
    return respondError(error);
  }
}
