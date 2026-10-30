import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Search, Send, Plus, Users, MoreVertical, Phone, Video, Info, Smile, Paperclip, Hash, AtSign, ExternalLink } from 'lucide-react';
import { messagesApi, ConversationSummary, ConversationMessages, Message, ConversationUser } from '../../api/messages';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth';
import { onlineActivityService } from '../../services/onlineActivityService';
import toast from 'react-hot-toast';
import {
  isImageAttachment,
  messageAttachmentUrl,
  openAttachmentInNewTab,
} from '@/lib/apiAttachmentUrls';
import { AttachmentImagePreview } from '@/components/AttachmentImagePreview';

export function MessagesPage() {
  const { t, i18n } = useTranslation('messages');
  const locale = i18n.language || 'en';
  // Prefer Zustand user (already hydrated by PrivateRoute) — avoid a second /auth/me
  const user = useAuthStore((s) => s.user);
  const [searchText, setSearchText] = useState('');
  const [selectedContact, setSelectedContact] = useState<ConversationUser | null>(null);
  const [messageText, setMessageText] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ConversationMessages | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<ConversationUser[]>([]);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [isCallActive, setIsCallActive] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video' | null>(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [openingAttachmentKey, setOpeningAttachmentKey] = useState<string | null>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initialize online tracking when user is authenticated
  useEffect(() => {
    if (user?.id) {
      onlineActivityService.startTracking(user.id);
      // Load data after tracking starts
    loadConversations();
    loadOrganizationUsers();
    }
    
    // Cleanup on unmount
    return () => {
      onlineActivityService.stopTracking();
    };
  }, [user?.id]);

  // Listen for online users updates
  useEffect(() => {
    updateOnlineUsers();
    
    const handleOnlineUsersUpdate = () => {
      updateOnlineUsers();
    };

    window.addEventListener('onlineUsersUpdated', handleOnlineUsersUpdate);
    
    // Also update periodically
    const interval = setInterval(updateOnlineUsers, 30000);

    return () => {
      window.removeEventListener('onlineUsersUpdated', handleOnlineUsersUpdate);
      clearInterval(interval);
    };
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowMoreMenu(false);
    };

    if (showMoreMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreMenu]);

  // Get real online users from tracking service
  const updateOnlineUsers = () => {
    const onlineUserIds = onlineActivityService.getOnlineUserIds();
    setOnlineUsers(onlineUserIds);
  };

  // Load conversation messages when contact is selected
  useEffect(() => {
    if (selectedContact) {
      loadConversationMessages(selectedContact.id);
      // Mark messages as read
      messagesApi.markAsRead(selectedContact.id).catch(console.error);
    }
  }, [selectedContact]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await messagesApi.getConversations();
      setConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizationUsers = async () => {
    try {
      const data = await messagesApi.getOrganizationUsers();
      setOrganizationUsers(data);
    } catch (error) {
      console.error('Error loading organization users:', error);
    }
  };

  const loadConversationMessages = async (partnerId: number) => {
    try {
      const data = await messagesApi.getConversation(partnerId);
      setCurrentConversation(data);
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedContact || sending) return;

    try {
      setSending(true);
      await messagesApi.sendMessage({
        content: messageText.trim(),
        receiver_id: selectedContact.id
      });
      
      setMessageText('');
      // Reload conversation to show new message
      await loadConversationMessages(selectedContact.id);
      // Reload conversations to update last message
      await loadConversations();
      // Record activity after sending message
      onlineActivityService.recordActivity();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(t('sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedContact || uploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      await messagesApi.sendMessageWithAttachment(selectedContact.id, file);
      await loadConversationMessages(selectedContact.id);
      await loadConversations();
      toast.success(t('attachmentSent'));
      onlineActivityService.recordActivity();
    } catch (err) {
      console.error('Error uploading attachment:', err);
      toast.error(t('attachmentFailed'));
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    // Record activity on any key press
    onlineActivityService.recordActivity();
  };

  const handleSelectContact = async (user: ConversationUser) => {
    setSelectedContact(user);
    setShowNewConversation(false);
    
    // Record activity when selecting contact
    onlineActivityService.recordActivity();
    
    // Update conversations list to mark as read
    const updatedConversations = conversations.map(conv => 
      conv.user.id === user.id 
        ? { ...conv, unread_count: 0 }
        : conv
    );
    setConversations(updatedConversations);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInMinutes < 1) {
      return t('time.now');
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h`;
    } else if (diffInDays === 1) {
      return t('time.yesterday');
    } else if (diffInDays < 7) {
      return date.toLocaleDateString(locale, { weekday: 'short' });
    } else {
      return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(locale, { 
      hour: 'numeric', 
      minute: '2-digit'
    });
  };

  const filteredConversations = conversations.filter(conv =>
    conv.user.first_name.toLowerCase().includes(searchText.toLowerCase()) ||
    conv.user.last_name.toLowerCase().includes(searchText.toLowerCase()) ||
    conv.user.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const filteredUsers = organizationUsers.filter(user =>
    user.first_name.toLowerCase().includes(searchText.toLowerCase()) ||
    user.last_name.toLowerCase().includes(searchText.toLowerCase()) ||
    user.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''} ${lastName[0] || ''}`.toUpperCase();
  };

  const isToday = (dateString: string) => {
    const messageDate = new Date(dateString);
    const today = new Date();
    return messageDate.toDateString() === today.toDateString();
  };

  const isYesterday = (dateString: string) => {
    const messageDate = new Date(dateString);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return messageDate.toDateString() === yesterday.toDateString();
  };

  const formatMessageDate = (dateString: string) => {
    if (isToday(dateString)) return t('time.today');
    if (isYesterday(dateString)) return t('time.yesterdayCap');
    return new Date(dateString).toLocaleDateString(locale, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Call handlers - FREE Jitsi Meet Integration
  const handleVoiceCall = async () => {
    if (!selectedContact) return;
    setIsCallActive(true);
    setCallType('voice');
    
    // Create unique room name
    const roomName = `leadlab-voice-${selectedContact.id}-${Date.now()}`;
    const jitsiUrl = `https://meet.jit.si/${roomName}#config.startAudioOnly=true`;
    
    try {
      // Send call invitation message to chat
      await messagesApi.sendMessage({
        content: `📞 Voice Call Invitation\n\n🎧 Join the voice call: ${jitsiUrl}\n\n📋 Room: ${roomName}\n\n⏰ Started at ${new Date().toLocaleTimeString()}`,
        receiver_id: selectedContact.id
      });
      
      // Reload conversation to show the invitation message
      await loadConversationMessages(selectedContact.id);
      await loadConversations();
      
      // Open call for initiator
      window.open(jitsiUrl, '_blank', 'width=800,height=600');
      
    } catch (error) {
      console.error('Error sending call invitation:', error);
    }
    
    // Reset call state after a moment
    setTimeout(() => {
      setIsCallActive(false);
      setCallType(null);
    }, 1000);
  };

  const handleVideoCall = async () => {
    if (!selectedContact) return;
    setIsCallActive(true);
    setCallType('video');
    
    // Create unique room name
    const roomName = `leadlab-video-${selectedContact.id}-${Date.now()}`;
    const jitsiUrl = `https://meet.jit.si/${roomName}`;
    
    try {
      // Send call invitation message to chat
      await messagesApi.sendMessage({
        content: `📹 Video Call Invitation\n\n🎥 Join the video call: ${jitsiUrl}\n\n📋 Room: ${roomName}\n\n⏰ Started at ${new Date().toLocaleTimeString()}`,
        receiver_id: selectedContact.id
      });
      
      // Reload conversation to show the invitation message
      await loadConversationMessages(selectedContact.id);
      await loadConversations();
      
      // Open call for initiator
      window.open(jitsiUrl, '_blank', 'width=1200,height=800');
      
    } catch (error) {
      console.error('Error sending call invitation:', error);
    }
    
    // Reset call state after a moment
    setTimeout(() => {
      setIsCallActive(false);
      setCallType(null);
    }, 1000);
  };

  const handleEndCall = () => {
    setIsCallActive(false);
    setCallType(null);
  };

  const handleShowInfo = () => {
    if (!selectedContact) return;
    setShowUserInfo(!showUserInfo);
  };

  const handleMoreOptions = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoreMenu(!showMoreMenu);
  };

  const isUserOnline = (userId: number) => {
    return onlineUsers.has(userId);
  };

  const parseAttachmentMessage = (content: string) => {
    // New format: [[ATTACHMENT_V2]]{json}
    const v2Idx = content.indexOf('[[ATTACHMENT_V2]]');
    if (v2Idx !== -1) {
      try {
        const jsonStr = content.slice(v2Idx + '[[ATTACHMENT_V2]]'.length).trim();
        const parsed = JSON.parse(jsonStr) as {
          filename?: string;
          stored_name?: string;
          size_bytes?: number;
          content_type?: string;
        };
        if (parsed.stored_name) {
          const fileName = parsed.filename || parsed.stored_name;
          const extension = fileName.includes('.')
            ? fileName.split('.').pop()?.toUpperCase() || 'FILE'
            : 'FILE';
          return {
            fileName,
            sizeBytes: Number(parsed.size_bytes || 0),
            storedName: parsed.stored_name,
            extension,
            contentType: parsed.content_type,
          };
        }
      } catch {
        /* fall through to legacy */
      }
    }
    const match = content.match(/^\[Attachment:\s*(.+?)\]\s*\((\d+)\s+bytes\)\.\s*Stored as\s+(.+?)\.?$/i);
    if (!match) return null;
    const fileName = match[1];
    const sizeBytes = Number(match[2] || 0);
    const storedName = match[3];
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : 'FILE';
    return {
      fileName,
      sizeBytes,
      storedName,
      extension: extension || 'FILE',
      contentType: undefined as string | undefined,
    };
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Check if message is a call invitation
  const isCallInvitation = (content: string) => {
    return content.includes('Call Invitation') && content.includes('meet.jit.si');
  };

  // Extract call URL from message
  const extractCallUrl = (content: string) => {
    const match = content.match(/https:\/\/meet\.jit\.si\/[^\s\n]+/);
    return match ? match[0] : null;
  };

  // Check if it's voice or video call
  const getCallType = (content: string) => {
    if (content.includes('📞 Voice Call')) return 'voice';
    if (content.includes('📹 Video Call')) return 'video';
    return null;
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shadow-sm">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <Hash className="h-5 w-5 mr-2 text-purple-600 dark:text-purple-400" />
              {t('title')}
            </h1>
            <button
              onClick={() => setShowNewConversation(!showNewConversation)}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {showNewConversation ? <Users className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={showNewConversation ? t('findTeammates') : t('searchConversations')}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-4 sm:p-6 md:p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : showNewConversation ? (
            // Team Members List
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('teamMembers', { count: filteredUsers.length })}
              </div>
              {filteredUsers.length === 0 ? (
                <div className="p-4 sm:p-6 md:p-8 text-center text-gray-500 dark:text-gray-400">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">{searchText ? t('noTeammatesFound') : t('noTeammatesAvailable')}</p>
                  {!searchText && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 max-w-xs mx-auto leading-relaxed">
                      {t('teammatesHelp')}{' '}
                      <Link to="/settings/team" className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                        {t('settingsTeam')}
                      </Link>{' '}
                      {t('or')}{' '}
                      <Link to="/team-management" className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                        {t('teamManagement')}
                      </Link>
                      .
                    </p>
                  )}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectContact(user)}
                    className="w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-lg transition-colors text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-sm">
                          {getInitials(user.first_name, user.last_name)}
                        </div>
                        {isUserOnline(user.id) && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-gray-900 dark:text-white group-hover:text-purple-600 truncate">
                          {user.first_name} {user.last_name}
                        </h3>
                          {isUserOnline(user.id) ? (
                            <span className="text-xs text-green-600 font-medium">● {t('online')}</span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">● {t('offline')}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            // Conversations List
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('recent', { count: filteredConversations.length })}
              </div>
              {filteredConversations.length === 0 ? (
                <div className="p-4 sm:p-6 md:p-8 text-center text-gray-500 dark:text-gray-400">
                  <Hash className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">{searchText ? t('noConversationsFound') : t('noConversationsYet')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('startNewHint')}</p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <button
                    key={conv.user.id}
                    onClick={() => handleSelectContact(conv.user)}
                    className={`w-full p-3 rounded-lg transition-colors text-left group ${
 selectedContact?.id === conv.user.id 
 ? 'bg-purple-50 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800' 
 : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
 }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-sm">
                          {getInitials(conv.user.first_name, conv.user.last_name)}
                        </div>
                        {conv.unread_count > 0 && (
                          <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1">
                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className={`font-medium truncate ${
 selectedContact?.id === conv.user.id ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-white'
 }`}>
                            {conv.user.first_name} {conv.user.last_name}
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            {conv.last_message ? formatTime(conv.last_message.created_at) : ''}
                          </span>
                        </div>
                        <p className={`text-sm truncate mt-1 ${
 conv.unread_count > 0 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-gray-400'
 }`}>
                          {conv.last_message?.content || t('noMessagesYet')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-white dark:bg-gray-800 ${showUserInfo ? 'mr-80' : ''} transition-all duration-300`}>
        {selectedContact ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-medium shadow-sm">
                      {getInitials(selectedContact.first_name, selectedContact.last_name)}
                    </div>
                    {isUserOnline(selectedContact.id) && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full"></div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedContact.first_name} {selectedContact.last_name}
                    </h2>
                    <p className={`text-sm font-medium ${isUserOnline(selectedContact.id) ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      {isUserOnline(selectedContact.id) ? t('activeNow') : t('offlineCap')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 relative">
                  <button 
                    onClick={handleVoiceCall}
                    disabled={!isUserOnline(selectedContact.id)}
                    className={`p-2 rounded-lg transition-colors ${
 isUserOnline(selectedContact.id) 
 ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700' 
 : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
 }`}
                    title={isUserOnline(selectedContact.id) ? t('voiceCallLower') : t('userOffline')}
                  >
                    <Phone className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleVideoCall}
                    disabled={!isUserOnline(selectedContact.id)}
                    className={`p-2 rounded-lg transition-colors ${
 isUserOnline(selectedContact.id) 
 ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700' 
 : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
 }`}
                    title={isUserOnline(selectedContact.id) ? t('videoCallLower') : t('userOffline')}
                  >
                    <Video className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleShowInfo}
                    className={`p-2 rounded-lg transition-colors ${
 showUserInfo ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
 }`}
                    title={t('userInformation')}
                  >
                    <Info className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleMoreOptions}
                    className={`p-2 rounded-lg transition-colors ${
 showMoreMenu ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
 }`}
                    title={t('moreOptions')}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  {/* More Options Dropdown */}
                  {showMoreMenu && (
                    <div className="absolute top-12 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 min-w-[200px] z-10">
                      <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        {t('exportHistory')}
                      </button>
                      <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        {t('clearHistory')}
                      </button>
                      <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        {t('blockUser')}
                      </button>
                      <button className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors">
                        {t('reportUser')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-gray-900">
              {currentConversation?.messages && currentConversation.messages.length > 0 ? (
                <>
                  {/* Date separator */}
                  {currentConversation.messages.length > 0 && (
                    <div className="flex items-center justify-center py-4">
                      <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          {formatMessageDate(currentConversation.messages[0].created_at)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {currentConversation.messages.map((message, index) => {
                    const isOwnMessage = message.sender_id !== selectedContact.id;
                    const showAvatar = !isOwnMessage && (
                      index === 0 || 
                      currentConversation.messages[index - 1].sender_id !== message.sender_id
                    );
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${
 !isOwnMessage && !showAvatar ? 'ml-12' : ''
 }`}
                      >
                        {!isOwnMessage && showAvatar && (
                          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-medium text-sm mr-3 mt-1 shadow-sm">
                            {getInitials(selectedContact.first_name, selectedContact.last_name)}
                          </div>
                        )}
                        {/* Call Invitation Message */}
                        {isCallInvitation(message.content) ? (
                          <div className={`max-w-xs lg:max-w-md rounded-2xl shadow-sm border-2 ${
 isOwnMessage
 ? 'bg-purple-50 dark:bg-purple-900/40 border-purple-200 dark:border-purple-700 rounded-br-md'
 : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 rounded-bl-md'
 }`}>
                            <div className="p-4">
                              <div className="flex items-center mb-3">
                                {getCallType(message.content) === 'voice' ? (
                                  <Phone className="h-5 w-5 mr-2 text-blue-600" />
                                ) : (
                                  <Video className="h-5 w-5 mr-2 text-blue-600" />
                                )}
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {getCallType(message.content) === 'voice' ? t('voiceCallInvitation') : t('videoCallInvitation')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                {t('startedCall', { name: isOwnMessage ? t('you') : selectedContact.first_name })}
                              </p>
                              {extractCallUrl(message.content) && (
                                <button
                                  onClick={() => window.open(extractCallUrl(message.content)!, '_blank')}
                                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  {t('joinCall')}
                                </button>
                              )}
                              <p className={`text-xs mt-2 ${
 isOwnMessage ? 'text-purple-500' : 'text-gray-500 dark:text-gray-400'
 }`}>
                                {formatMessageTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        ) : (() => {
                          const attachment = message.attachment
                            ? {
                                fileName: message.attachment.filename,
                                sizeBytes: message.attachment.size_bytes,
                                storedName: message.attachment.stored_name,
                                extension: message.attachment.filename.includes('.')
                                  ? message.attachment.filename.split('.').pop()?.toUpperCase() || 'FILE'
                                  : 'FILE',
                                contentType: message.attachment.content_type,
                              }
                            : parseAttachmentMessage(message.content);
                          if (attachment) {
                            const attKey = `${message.id}-${attachment.storedName}`;
                            const attUrl = messageAttachmentUrl(attachment.storedName);
                            const showImage = isImageAttachment(
                              attachment.contentType,
                              attachment.fileName
                            );
                            return (
                              <div
                                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
 isOwnMessage
 ? 'bg-purple-600 text-white rounded-br-md'
 : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-bl-md'
 }`}
                              >
                                {showImage && (
                                  <div className="mb-2">
                                    <AttachmentImagePreview
                                      url={attUrl}
                                      alt={attachment.fileName}
                                      variant={isOwnMessage ? 'onPrimary' : 'default'}
                                    />
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold">{attachment.fileName}</p>
                                    <p className={`text-xs ${isOwnMessage ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                      {attachment.extension} · {formatFileSize(attachment.sizeBytes)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={openingAttachmentKey === attKey}
                                    onClick={async () => {
                                      try {
                                        setOpeningAttachmentKey(attKey);
                                        await openAttachmentInNewTab(attUrl);
                                      } catch (err: unknown) {
                                        console.error(err);
                                        const msg =
                                          err instanceof Error ? err.message : t('openAttachmentFailed');
                                        toast.error(msg);
                                      } finally {
                                        setOpeningAttachmentKey(null);
                                      }
                                    }}
                                    className={`text-xs underline disabled:opacity-50 ${isOwnMessage ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`}
                                  >
                                    {openingAttachmentKey === attKey ? t('opening') : t('open')}
                                  </button>
                                </div>
                                <p
                                  className={`text-xs mt-2 ${
 isOwnMessage ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'
 }`}
                                >
                                  {formatMessageTime(message.created_at)}
                                </p>
                              </div>
                            );
                          }
                          return (
                            <div
                              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
 isOwnMessage
 ? 'bg-purple-600 text-white rounded-br-md'
 : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 rounded-bl-md'
 }`}
                            >
                              <p className="text-sm leading-relaxed">{message.content}</p>
                              <p
                                className={`text-xs mt-2 ${
 isOwnMessage ? 'text-purple-200' : 'text-gray-500 dark:text-gray-400'
 }`}
                              >
                                {formatMessageTime(message.created_at)}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 shadow-lg">
                      {getInitials(selectedContact.first_name, selectedContact.last_name)}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t('startConversationWith', { name: selectedContact.first_name })}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {t('sendToBegin')}
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <input
                ref={attachmentInputRef}
                type="file"
                className="hidden"
                onChange={handleAttachmentChange}
              />
              <div className="flex items-end space-x-3">
                <button
                  type="button"
                  disabled={uploadingAttachment || !selectedContact}
                  onClick={() => attachmentInputRef.current?.click()}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40"
                  aria-label={t('attachFile')}
                >
                  <Paperclip className={`h-5 w-5 ${uploadingAttachment ? 'animate-pulse' : ''}`} />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('messagePlaceholder', { name: selectedContact.first_name })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none max-h-32 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    rows={1}
                    style={{ minHeight: '48px' }}
                  />
                </div>
                <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  <Smile className="h-5 w-5" />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sending}
                  className={`p-3 rounded-lg transition-colors ${
 messageText.trim() && !sending
 ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
 : 'bg-gray-200 text-gray-400 cursor-not-allowed'
 }`}
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white dark:border-gray-800 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 px-1">
                <Trans
                  i18nKey="keyboardHint"
                  t={t}
                  components={{
                    enter: <kbd className="px-1 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded" />,
                    shiftEnter: <kbd className="px-1 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded" />,
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          // Welcome Screen
          <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6 shadow-lg">
                <Hash className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('welcomeTitle')}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                {t('welcomeBody')}
              </p>
              <button
                onClick={() => setShowNewConversation(true)}
                className="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
              >
                <Plus className="h-5 w-5 mr-2" />
                {t('startNewConversation')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Info Panel */}
      {showUserInfo && selectedContact && (
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col shadow-sm">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('userInformation')}</h3>
              <button
                onClick={() => setShowUserInfo(false)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* User Profile */}
          <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="relative inline-block">
                <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg">
                  {getInitials(selectedContact.first_name, selectedContact.last_name)}
                </div>
                {isUserOnline(selectedContact.id) && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 border-3 border-white dark:border-gray-800 rounded-full"></div>
                )}
              </div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                {selectedContact.first_name} {selectedContact.last_name}
              </h4>
              <p className={`text-sm font-medium mb-2 ${
 isUserOnline(selectedContact.id) ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'
 }`}>
                {isUserOnline(selectedContact.id) ? `● ${t('activeNow')}` : `● ${t('offlineCap')}`}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{selectedContact.email}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('quickActions')}</h5>
            <div className="space-y-2">
              <button 
                onClick={handleVoiceCall}
                disabled={!isUserOnline(selectedContact.id)}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
 isUserOnline(selectedContact.id)
 ? 'bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
 : 'bg-gray-25 text-gray-400 dark:text-gray-600 cursor-not-allowed'
 }`}
              >
                <Phone className="h-5 w-5 mr-3" />
                {t('voiceCall')}
              </button>
              <button 
                onClick={handleVideoCall}
                disabled={!isUserOnline(selectedContact.id)}
                className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
 isUserOnline(selectedContact.id)
 ? 'bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
 : 'bg-gray-25 text-gray-400 dark:text-gray-600 cursor-not-allowed'
 }`}
              >
                <Video className="h-5 w-5 mr-3" />
                {t('videoCall')}
              </button>
            </div>
          </div>

          {/* User Details */}
          <div className="px-6 py-4 flex-1">
            <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('details')}</h5>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('email')}</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{selectedContact.email}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('status')}</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {isUserOnline(selectedContact.id) ? t('online') : t('offlineCap')}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('userId')}</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">#{selectedContact.id}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-2">
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-lg transition-colors">
                {t('exportHistory')}
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-lg transition-colors">
                {t('clearHistory')}
              </button>
              <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                {t('blockUser')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
