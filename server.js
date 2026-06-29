const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

const onlineUsers = new Map();
const roomUsers = new Map();
const activeCalls = new Map();

function roomKey(conversationId) {
  return `conversation:${conversationId}`;
}

async function buildSidebarPayload(conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: { include: { user: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { seenBy: true }
      }
    }
  });

  if (!conversation) return null;

  return {
    id: conversation.id,
    title: conversation.title,
    type: conversation.type,
    members: conversation.members.map((m) => ({ userId: m.userId, name: m.user.name })),
    lastMessage: conversation.messages[0]?.content || '',
    updatedAt: conversation.updatedAt
  };
}

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer, {
    path: '/api/socket_io',
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    socket.on('join-conversation', async ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      socket.data.userId = userId;
      socket.data.conversationId = conversationId;
      socket.join(roomKey(conversationId));
      onlineUsers.set(socket.id, { userId, conversationId });

      const room = roomUsers.get(conversationId) || new Set();
      room.add(userId);
      roomUsers.set(conversationId, room);
      io.to(roomKey(conversationId)).emit('presence:update', { onlineCount: room.size });
    });

    socket.on('typing:start', ({ conversationId, userId, name }) => {
      socket.to(roomKey(conversationId)).emit('typing:update', { userId, name, isTyping: true });
    });

    socket.on('typing:stop', ({ conversationId, userId, name }) => {
      socket.to(roomKey(conversationId)).emit('typing:update', { userId, name, isTyping: false });
    });

    socket.on('message:send', async (payload) => {
      try {
        const { conversationId, senderId, content, replyToId, attachmentUrl, attachmentName, attachmentMime, type } = payload;
        if (!conversationId || !senderId || (!content && !attachmentUrl)) return;

        const member = await prisma.conversationMember.findFirst({ where: { conversationId, userId: senderId } });
        if (!member) return;

        const recipients = await prisma.conversationMember.findMany({ where: { conversationId, userId: { not: senderId } } });

        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId,
            content: content || '',
            replyToId: replyToId || null,
            attachmentUrl: attachmentUrl || null,
            attachmentName: attachmentName || null,
            attachmentMime: attachmentMime || null,
            type: type || 'TEXT',
            deliveredTo: {
              create: recipients.map((item) => ({ userId: item.userId }))
            }
          },
          include: {
            sender: true,
            replyTo: { include: { sender: true } },
            forwardedFrom: { include: { sender: true } },
            seenBy: { include: { user: true } },
            deliveredTo: { include: { user: true } }
          }
        });

        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        io.to(roomKey(conversationId)).emit('message:new', message);
        const sidebarPayload = await buildSidebarPayload(conversationId);
        if (sidebarPayload) io.emit('conversation:updated', sidebarPayload);
      } catch (error) {
        socket.emit('message:error', { error: 'ارسال پیام با خطا مواجه شد.' });
      }
    });

    socket.on('message:seen', async ({ conversationId, messageId, userId }) => {
      try {
        if (!conversationId || !messageId || !userId) return;
        await prisma.messageSeen.upsert({
          where: { messageId_userId: { messageId, userId } },
          update: { seenAt: new Date() },
          create: { messageId, userId }
        });
        io.to(roomKey(conversationId)).emit('message:seen:update', { messageId, userId, seenAt: new Date().toISOString() });
        const sidebarPayload = await buildSidebarPayload(conversationId);
        if (sidebarPayload) io.emit('conversation:updated', sidebarPayload);
      } catch {}
    });

    socket.on('message:edit', async ({ conversationId, messageId, userId, content }) => {
      try {
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message || message.senderId !== userId || message.deletedAt) return;

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content, isEdited: true },
          include: {
            sender: true,
            replyTo: { include: { sender: true } },
            forwardedFrom: { include: { sender: true } },
            seenBy: { include: { user: true } },
            deliveredTo: { include: { user: true } }
          }
        });

        io.to(roomKey(conversationId)).emit('message:updated', updated);
        const sidebarPayload = await buildSidebarPayload(conversationId);
        if (sidebarPayload) io.emit('conversation:updated', sidebarPayload);
      } catch {}
    });

    socket.on('message:delete', async ({ conversationId, messageId, userId }) => {
      try {
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message || message.senderId !== userId || message.deletedAt) return;

        const deleted = await prisma.message.update({
          where: { id: messageId },
          data: {
            content: 'این پیام حذف شده است.',
            attachmentUrl: null,
            attachmentName: null,
            attachmentMime: null,
            deletedAt: new Date()
          },
          include: {
            sender: true,
            replyTo: { include: { sender: true } },
            forwardedFrom: { include: { sender: true } },
            seenBy: { include: { user: true } },
            deliveredTo: { include: { user: true } }
          }
        });

        io.to(roomKey(conversationId)).emit('message:deleted', deleted);
        const sidebarPayload = await buildSidebarPayload(conversationId);
        if (sidebarPayload) io.emit('conversation:updated', sidebarPayload);
      } catch {}
    });

    socket.on('call:initiate', async ({ conversationId, initiatedById, type }) => {
      try {
        const call = await prisma.call.create({
          data: {
            conversationId,
            initiatedById,
            type,
            status: 'RINGING'
          }
        });
        activeCalls.set(call.id, { conversationId, initiatedById, type });
        io.to(roomKey(conversationId)).emit('call:incoming', { callId: call.id, conversationId, initiatedById, type });
      } catch {}
    });

    socket.on('call:accept', async ({ callId, conversationId, userId }) => {
      try {
        await prisma.call.update({ where: { id: callId }, data: { status: 'ACCEPTED' } });
        io.to(roomKey(conversationId)).emit('call:accepted', { callId, userId });
      } catch {}
    });

    socket.on('call:reject', async ({ callId, conversationId, userId }) => {
      try {
        await prisma.call.update({ where: { id: callId }, data: { status: 'REJECTED', endedAt: new Date() } });
        io.to(roomKey(conversationId)).emit('call:rejected', { callId, userId });
      } catch {}
    });

    socket.on('call:end', async ({ callId, conversationId, userId }) => {
      try {
        await prisma.call.update({ where: { id: callId }, data: { status: 'ENDED', endedAt: new Date() } });
        io.to(roomKey(conversationId)).emit('call:ended', { callId, userId });
        activeCalls.delete(callId);
      } catch {}
    });

    socket.on('webrtc:offer', ({ conversationId, offer, fromUserId }) => {
      socket.to(roomKey(conversationId)).emit('webrtc:offer', { offer, fromUserId });
    });

    socket.on('webrtc:answer', ({ conversationId, answer, fromUserId }) => {
      socket.to(roomKey(conversationId)).emit('webrtc:answer', { answer, fromUserId });
    });

    socket.on('webrtc:ice-candidate', ({ conversationId, candidate, fromUserId }) => {
      socket.to(roomKey(conversationId)).emit('webrtc:ice-candidate', { candidate, fromUserId });
    });

    socket.on('disconnect', () => {
      const data = onlineUsers.get(socket.id);
      if (data) {
        onlineUsers.delete(socket.id);
        const room = roomUsers.get(data.conversationId) || new Set();
        room.delete(data.userId);
        if (room.size === 0) {
          roomUsers.delete(data.conversationId);
        } else {
          roomUsers.set(data.conversationId, room);
        }
        io.to(roomKey(data.conversationId)).emit('presence:update', { onlineCount: room.size });
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
