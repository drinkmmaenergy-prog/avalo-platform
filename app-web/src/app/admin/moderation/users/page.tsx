import { Users } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { Badge } from '../components/Badge';

export const metadata = {
  title: 'Users | Avalo Moderator',
  description: 'View and manage platform users',
};

// Dummy data for PACK 1 (read-only display)
const mockUsers = [
  {
    id: '1',
    username: 'user_alpha',
    email: 'alpha@example.com',
    status: 'active',
    joinedDate: '2024-01-15',
    incidents: 0,
  },
  {
    id: '2',
    username: 'user_beta',
    email: 'beta@example.com',
    status: 'restricted',
    joinedDate: '2024-02-20',
    incidents: 2,
  },
  {
    id: '3',
    username: 'user_gamma',
    email: 'gamma@example.com',
    status: 'active',
    joinedDate: '2024-03-10',
    incidents: 0,
  },
  {
    id: '4',
    username: 'user_delta',
    email: 'delta@example.com',
    status: 'suspended',
    joinedDate: '2024-01-05',
    incidents: 5,
  },
  {
    id: '5',
    username: 'user_epsilon',
    email: 'epsilon@example.com',
    status: 'active',
    joinedDate: '2024-04-01',
    incidents: 1,
  },
];

const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => {
  switch (status) {
    case 'active':
      return 'success';
    case 'restricted':
      return 'warning';
    case 'suspended':
    case 'banned':
      return 'danger';
    default:
      return 'neutral';
  }
};

export default function UsersPage() {
  const columns = [
    {
      key: 'username',
      label: 'Username',
    },
    {
      key: 'email',
      label: 'Email',
    },
    {
      key: 'status',
      label: 'Status',
      render: (user: typeof mockUsers[0]) => (
        <Badge variant={getStatusVariant(user.status)}>
          {user.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'joinedDate',
      label: 'Joined',
      render: (user: typeof mockUsers[0]) => (
        <span className="text-gray-400">
          {new Date(user.joinedDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'incidents',
      label: 'Incidents',
      render: (user: typeof mockUsers[0]) => (
        <span className={user.incidents > 0 ? 'text-yellow-400 font-semibold' : 'text-gray-400'}>
          {user.incidents}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Users</h1>
          <p className="text-gray-400 text-lg">
            View and manage platform users
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] rounded-lg border border-[#40E0D0]/20">
          <Users className="w-5 h-5 text-[#40E0D0]" />
          <span className="text-white font-semibold">{mockUsers.length} Users</span>
        </div>
      </div>

      {/* Search and Filters Placeholder */}
      <div className="bg-[#1A1A1A] rounded-xl border border-[#40E0D0]/20 p-6">
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search users by username or email..."
            className="flex-1 px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#40E0D0] focus:outline-none"
            disabled
          />
          <select
            className="px-4 py-2 bg-[#0F0F0F] border border-gray-700 rounded-lg text-white focus:border-[#40E0D0] focus:outline-none"
            disabled
          >
            <option>All Statuses</option>
            <option>Active</option>
            <option>Restricted</option>
            <option>Suspended</option>
          </select>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Note: Search and filter functionality will be available in PACK 2
        </p>
      </div>

      {/* Users Table */}
      <DataTable
        columns={columns}
        data={mockUsers}
        emptyMessage="No users found"
      />

      {/* Info Banner */}
      <div className="bg-[#40E0D0]/10 border border-[#40E0D0]/30 rounded-lg p-4">
        <p className="text-sm text-[#40E0D0]">
          ℹ️ <strong>PACK 1 - Read-Only Mode:</strong> This page displays user data for viewing only. 
          User management actions (warn, restrict, suspend, ban) will be available in PACK 2.
        </p>
      </div>
    </div>
  );
}