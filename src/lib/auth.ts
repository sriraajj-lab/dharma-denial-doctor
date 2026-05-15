import { AppUser, UserRole } from './types';

// In-memory users store with default admin
let users: (AppUser & { passwordHash: string })[] = [
  {
    id: 'usr-001',
    email: 'admin@denialmanagement.com',
    name: 'System Admin',
    role: 'admin',
    department: 'Administration',
    isActive: true,
    passwordHash: 'admin123', // In production, use bcrypt
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-002',
    email: 'manager@denialmanagement.com',
    name: 'Sarah Johnson',
    role: 'manager',
    department: 'Revenue Cycle',
    isActive: true,
    passwordHash: 'manager123',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-003',
    email: 'biller@denialmanagement.com',
    name: 'Mike Chen',
    role: 'biller',
    department: 'Billing',
    isActive: true,
    passwordHash: 'biller123',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-004',
    email: 'coder@denialmanagement.com',
    name: 'Jessica Williams',
    role: 'coder',
    department: 'Coding',
    isActive: true,
    passwordHash: 'coder123',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-005',
    email: 'client@example.com',
    name: 'Dr. Robert Smith',
    role: 'client',
    department: 'Orthopedics',
    isActive: true,
    passwordHash: 'client123',
    createdAt: new Date().toISOString(),
  },
];

// Session store
let sessions: Map<string, { userId: string; expires: Date }> = new Map();

/**
 * Simple authentication (production would use bcrypt + JWT)
 */
export function authenticateUser(email: string, password: string): { user: AppUser; sessionToken: string } | null {
  const user = users.find((u) => u.email === email && u.passwordHash === password && u.isActive);
  if (!user) return null;

  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  const expires = new Date();
  expires.setHours(expires.getHours() + 8); // 8 hour sessions

  sessions.set(sessionToken, { userId: user.id, expires });

  // Update last login
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx !== -1) users[idx].lastLoginAt = new Date().toISOString();

  const { passwordHash, ...appUser } = user;
  return { user: appUser, sessionToken };
}

/**
 * Validate session token and return user
 */
export function validateSession(sessionToken: string): AppUser | null {
  const session = sessions.get(sessionToken);
  if (!session) return null;
  if (new Date() > session.expires) {
    sessions.delete(sessionToken);
    return null;
  }

  const user = users.find((u) => u.id === session.userId);
  if (!user || !user.isActive) return null;

  const { passwordHash, ...appUser } = user;
  return appUser;
}

/**
 * Logout / destroy session
 */
export function destroySession(sessionToken: string): boolean {
  return sessions.delete(sessionToken);
}

/**
 * Role-based permission check
 */
export function hasPermission(role: UserRole, action: string): boolean {
  const permissions: Record<UserRole, string[]> = {
    admin: ['*'], // All permissions
    manager: [
      'view_denials', 'analyze', 'correct', 'quality_check', 'appeal',
      'assign', 'export', 'view_audit', 'manage_rules', 'view_financials',
      'record_payment', 'batch_process', 'manage_users', 'view_reports',
    ],
    biller: [
      'view_denials', 'analyze', 'correct', 'appeal', 'add_notes',
      'export', 'view_financials', 'record_payment', 'scrub_claims',
    ],
    coder: [
      'view_denials', 'analyze', 'correct', 'quality_check', 'add_notes',
      'scrub_claims',
    ],
    client: [
      'view_denials', 'view_reports', 'export', 'view_financials',
    ],
  };

  const userPermissions = permissions[role];
  if (!userPermissions) return false;
  if (userPermissions.includes('*')) return true;
  return userPermissions.includes(action);
}

/**
 * Get all users (admin function)
 */
export function getUsers(): AppUser[] {
  return users.map(({ passwordHash, ...u }) => u);
}

/**
 * Get user by ID
 */
export function getUserById(id: string): AppUser | null {
  const user = users.find((u) => u.id === id);
  if (!user) return null;
  const { passwordHash, ...appUser } = user;
  return appUser;
}

/**
 * Create new user
 */
export function createUser(data: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  department?: string;
}): AppUser {
  const newUser = {
    id: `usr-${String(users.length + 1).padStart(3, '0')}`,
    email: data.email,
    name: data.name,
    role: data.role,
    department: data.department,
    isActive: true,
    passwordHash: data.password, // In production: bcrypt hash
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  const { passwordHash, ...appUser } = newUser;
  return appUser;
}

/**
 * Get current user for the demo (returns first active user)
 */
export function getCurrentUser(): AppUser {
  const { passwordHash, ...user } = users[0];
  return user;
}
