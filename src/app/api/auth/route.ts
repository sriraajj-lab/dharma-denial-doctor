import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, validateSession, destroySession, getUsers, createUser, getCurrentUser } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email, password, name, role, department } = body;

    switch (action) {
      case 'login': {
        if (!email || !password) {
          return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
        }

        const result = authenticateUser(email, password);
        if (!result) {
          return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        createAuditLog({
          userId: result.user.id,
          userName: result.user.name,
          action: 'login',
          entityType: 'user',
          entityId: result.user.id,
        });

        return NextResponse.json(result);
      }

      case 'logout': {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (token) {
          destroySession(token);
          createAuditLog({
            action: 'logout',
            entityType: 'user',
          });
        }
        return NextResponse.json({ success: true });
      }

      case 'validate': {
        const sessionToken = request.headers.get('authorization')?.replace('Bearer ', '') || body.sessionToken;
        if (!sessionToken) {
          return NextResponse.json({ error: 'No session token' }, { status: 401 });
        }
        const user = validateSession(sessionToken);
        if (!user) {
          return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
        }
        return NextResponse.json({ user });
      }

      case 'create_user': {
        if (!email || !password || !name || !role) {
          return NextResponse.json({ error: 'email, password, name, and role required' }, { status: 400 });
        }
        const newUser = createUser({ email, password, name, role, department });
        return NextResponse.json({ user: newUser });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const users = getUsers();
    const currentUser = getCurrentUser();
    return NextResponse.json({ users, currentUser });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
