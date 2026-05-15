import { NextRequest, NextResponse } from 'next/server';
import { getDenialById, updateDenial } from '@/lib/data';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denial = await getDenialById(id);
    if (!denial) {
      return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
    }
    return NextResponse.json(denial);
  } catch (error) {
    console.error('Error fetching denial:', error);
    return NextResponse.json({ error: 'Failed to fetch denial' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const denial = await updateDenial(id, body);
    if (!denial) {
      return NextResponse.json({ error: 'Denial not found' }, { status: 404 });
    }
    return NextResponse.json(denial);
  } catch (error) {
    console.error('Error updating denial:', error);
    return NextResponse.json({ error: 'Failed to update denial' }, { status: 500 });
  }
}
