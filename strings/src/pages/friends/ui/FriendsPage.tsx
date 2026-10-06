import { useMemo } from 'react';
import { usePageContext } from '../../../shared/lib/usePageContext';
import { useTabNavigation } from '../../../app/providers/TabNavigationContext';
import type { FriendItem } from '../model/types';
import { useFriends } from '../lib/useFriends';
import { groupFriends } from '../lib/groupFriends';
import { resolveAvatarSticker } from '../../../shared/lib/avatarSticker';
import { AvatarSticker } from '../../../shared/ui/avatar-sticker/AvatarSticker';
import './friends-page.css';
import EmptyIcon from '../../../assets/Path.svg';
import { UserAvatar } from '../../../shared/ui/user-avatar/UserAvatar';

const FriendCard = ({ friend, onClick }: { friend: FriendItem; onClick: () => void }) => {
  const sticker = resolveAvatarSticker({
    isSaved: friend.isSaved,
    hasNote: Boolean(friend.note?.trim()),
    fromScan: friend.fromScan,
  })

  return (
    <div className="friends-page__friend-card" onClick={onClick}>
      <div className="friends-page__friend-avatar">
        <UserAvatar
          userId={friend.id}
          photoUrl={friend.avatarUrl}
          size="sm"
          alt={`${friend.firstName} ${friend.lastName}`}
        />
        {sticker && <AvatarSticker kind={sticker} />}
      </div>
      <div className="friends-page__friend-info">
        <p className="friends-page__friend-name">{friend.firstName} {friend.lastName}</p>
        {friend.description && (
          <p className="friends-page__friend-desc">{friend.description}</p>
        )}
      </div>
    </div>
  );
};

const FriendsSkeleton = () => (
  <div className="friends-page__skeleton" aria-hidden>
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="friends-page__friend-card friends-page__friend-card--skeleton">
        <div className="friends-page__friend-avatar">
          <div className="friends-page__skeleton-block friends-page__skeleton-block--avatar" />
        </div>
        <div className="friends-page__friend-info">
          <div className="friends-page__skeleton-block friends-page__skeleton-block--name" />
          <div className="friends-page__skeleton-block friends-page__skeleton-block--desc" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ message }: { message: string }) => {
  return (
    <div className="friends-page__empty">
      <img src={EmptyIcon} alt="Пусто" className="friends-page__empty-icon" />
      <h3 className="friends-page__empty-title">Пока тут пусто</h3>
      <p className="friends-page__empty-description">{message}</p>
    </div>
  );
};

export const FriendsPage = () => {
  const { openUserProfile } = useTabNavigation();
  const [activeTab, setActiveTab] = usePageContext<'my' | 'favorites'>('friends-tab', 'my');
  const {
    contacts,
    savedUsers,
    hasMoreContacts,
    hasMoreSavedUsers,
    loadMoreContacts,
    loadMoreSavedUsers,
    loadingMoreContacts,
    loadingMoreSavedUsers,
    loading,
    error,
    refetch,
  } = useFriends();

  const friends = activeTab === 'favorites' ? savedUsers : contacts;
  const hasMore = activeTab === 'favorites' ? hasMoreSavedUsers : hasMoreContacts;
  const loadMore = activeTab === 'favorites' ? loadMoreSavedUsers : loadMoreContacts;
  const loadingMore = activeTab === 'favorites' ? loadingMoreSavedUsers : loadingMoreContacts;

  const groupedFriends = useMemo(() => {
    if (activeTab !== 'my') return null;
    return groupFriends(friends);
  }, [activeTab, friends]);

  const handleFriendClick = (friendId: string) => {
    openUserProfile(friendId, 'friends');
  };

  const renderContent = () => {
    if (loading) {
      return <FriendsSkeleton />;
    }

    if (error) {
      return (
        <div className="friends-page__empty">
          <p className="friends-page__empty-description">{error}</p>
          <button type="button" className="friends-page__retry" onClick={() => void refetch()}>
            Повторить
          </button>
        </div>
      );
    }

    if (friends.length === 0) {
      const message =
        activeTab === 'favorites'
          ? 'Отмечай сердечками тех, с кем хочешь связаться в ближайшее время'
          : 'Каждая встреча может стать началом — сканируй QR и сохраняй в Нити';
      return <EmptyState message={message} />;
    }

    if (activeTab === 'my' && groupedFriends) {
      return (
        <>
          {groupedFriends.map((group) => (
            <div key={group.title} className="friends-page__group">
              <h2 className="friends-page__group-title">{group.title}</h2>
              <div className="friends-page__list">
                {group.items.map((friend) => (
                  <FriendCard
                    key={friend.id}
                    friend={friend}
                    onClick={() => handleFriendClick(friend.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      );
    }

    return (
      <div className="friends-page__list">
        {friends.map((friend) => (
          <FriendCard key={friend.id} friend={friend} onClick={() => handleFriendClick(friend.id)} />
        ))}
      </div>
    );
  };

  return (
    <main className="friends-page">
      <div className="friends-page__content">
        <h1 className="friends-page__title">Нити</h1>
        <div className="friends-page__list-block">
          <div className="friends-page__tabs">
            <button
              type="button"
              className={`friends-page__tab ${activeTab === 'my' ? 'friends-page__tab--active' : ''}`}
              onClick={() => setActiveTab('my')}
            >
              Мои
            </button>
            <div className="friends-page__tab-line" />
            <button
              type="button"
              className={`friends-page__tab ${activeTab === 'favorites' ? 'friends-page__tab--active' : ''}`}
              onClick={() => setActiveTab('favorites')}
            >
              Избранное
            </button>
          </div>

          {/* key по вкладке: на iOS 26 подмена детей скроллера in-place оставляет
              сталые тайлы — пересоздаём контейнер целиком */}
          <div key={activeTab} className="friends-page__tab-content">
            {renderContent()}

            {!loading && !error && friends.length > 0 && hasMore && (
              <button
                type="button"
                className="load-more-btn"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Загружаем…' : 'Загрузить ещё'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
