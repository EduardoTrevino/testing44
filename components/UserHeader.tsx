"use client";

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useUserStore } from '@/lib/store';

export default function UserHeader() {
  const { name, setName } = useUserStore();
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(name);

  const handleSave = () => {
    if (tempName.trim()) {
      setName(tempName.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-4">
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            className="w-40"
            autoFocus
          />
          <Button onClick={handleSave} size="sm">Save</Button>
          <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">Cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-navy-900">Hello, {name}</h2>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 hover:bg-navy-50 rounded-full"
          >
            <Pencil className="w-4 h-4 text-navy-500" />
          </button>
        </div>
      )}
    </div>
  );
}