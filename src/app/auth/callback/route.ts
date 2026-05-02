import { NextRequest, NextResponse } from 'next/server';

// Fallback: redirect ke home jika ada yang mengakses /auth/callback langsung
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/home`);
}
