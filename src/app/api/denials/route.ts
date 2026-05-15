import { NextRequest, NextResponse } from 'next/server';
import { getDenials, createDenial } from '@/lib/data';

export async function GET(request: NextRequest) {
  try {
    const denials = await getDenials();
    const { searchParams } = new URL(request.url);

    let filtered = [...denials];

    // Filter by status
    const status = searchParams.get('status');
    if (status && status !== 'all') {
      filtered = filtered.filter((d) => d.status === status);
    }

    // Filter by payer
    const payer = searchParams.get('payer');
    if (payer) {
      filtered = filtered.filter((d) => d.payerName === payer);
    }

    // Filter by category
    const category = searchParams.get('category');
    if (category) {
      filtered = filtered.filter((d) => d.denialCategory === category);
    }

    // Filter by CARC code
    const carcCode = searchParams.get('carcCode');
    if (carcCode) {
      filtered = filtered.filter((d) => d.carcCode === carcCode);
    }

    // Filter by priority
    const priority = searchParams.get('priority');
    if (priority) {
      filtered = filtered.filter((d) => d.priority === priority);
    }

    // Search
    const search = searchParams.get('search');
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.claimNumber.toLowerCase().includes(searchLower) ||
          d.patientName.toLowerCase().includes(searchLower) ||
          d.carcCode.toLowerCase().includes(searchLower) ||
          d.cptCode.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sort = searchParams.get('sort') || 'denialDate';
    const order = searchParams.get('order') || 'desc';
    filtered.sort((a, b) => {
      const aVal = String(a[sort as keyof typeof a] ?? '');
      const bVal = String(b[sort as keyof typeof b] ?? '');
      return order === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    });

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return NextResponse.json({
      denials: paginated,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
    });
  } catch (error) {
    console.error('Error fetching denials:', error);
    return NextResponse.json({ error: 'Failed to fetch denials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const denial = await createDenial(body);
    return NextResponse.json(denial, { status: 201 });
  } catch (error) {
    console.error('Error creating denial:', error);
    return NextResponse.json({ error: 'Failed to create denial' }, { status: 500 });
  }
}
