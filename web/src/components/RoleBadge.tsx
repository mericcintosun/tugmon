import React from 'react';
import { ROLE_META, type RoleId } from '@/utils/constants';

interface RoleBadgeProps {
  roleId: RoleId;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({ roleId }) => {
  if (roleId === 0) {
    return (
      <span className="px-3 py-1 bg-gray-700/80 text-gray-400 text-[10px] font-bold rounded-full border border-gray-500 animate-pulse">
        NO ROLE
      </span>
    );
  }

  const { emoji, label, color } = ROLE_META[roleId];

  const colorMap: Record<string, string> = {
    sky:    'bg-sky-600/80    border-sky-400    shadow-sky-500/20    text-sky-100',
    red:    'bg-red-700/80    border-red-400    shadow-red-500/20    text-red-100',
    yellow: 'bg-yellow-500/80 border-yellow-300 shadow-yellow-400/20 text-yellow-900',
  };
  const dotMap: Record<string, string> = {
    sky:    'bg-sky-200',
    red:    'bg-red-200',
    yellow: 'bg-yellow-100',
  };

  return (
    <span className={`px-3 py-1 text-[10px] font-black rounded-full flex items-center gap-1.5 border shadow-lg ${colorMap[color] ?? 'bg-gray-600 border-gray-400 text-white'}`}>
      <span className={`w-1.5 h-1.5 rounded-full animate-ping ${dotMap[color] ?? 'bg-white'}`} />
      {emoji} {label.toUpperCase()}
    </span>
  );
};

export default RoleBadge;
