import { useState, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getHomePrefecture, saveHomePrefecture, getDisplayName, saveDisplayName } from '../lib/api';
import UserSettingsSheet from './UserSettingsSheet';

export default function SettingsMenuButton() {
  const { user } = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [homePref, setHomePref] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getHomePrefecture(user.id), getDisplayName(user.id)])
      .then(([pref, name]) => { setHomePref(pref); setDisplayName(name); });
  }, [user?.id]);

  const handleSave = async (newPref: string | null, newName: string) => {
    if (!user) return;
    setHomePref(newPref);
    setDisplayName(newName || null);
    await Promise.all([
      saveHomePrefecture(user.id, newPref),
      saveDisplayName(user.id, newName),
    ]);
  };

  return (
    <>
      <button
        onClick={() => setShowSheet(true)}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
        aria-label="設定"
      >
        <MoreVertical size={16} />
      </button>
      {showSheet && user && (
        <UserSettingsSheet
          homePref={homePref}
          displayName={displayName}
          onSave={handleSave}
          onClose={() => setShowSheet(false)}
        />
      )}
    </>
  );
}
