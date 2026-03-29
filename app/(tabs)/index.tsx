import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  AppState,
  Dimensions,
  Image,
  PixelRatio,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/context/UserContext';
import {
  mediaDevices,
  RTCPeerConnection,
  MediaStream,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import VoiceService from '@/modules/VoiceService';
import PiPService from '@/modules/PiPService';

// ─── Constants ────────────────────────────────────────────────────────────────
const API_MIC  = 'https://api-mike-v2.runaesike.com/mic-data';
const API_LIST = 'https://arenacore.runaesike.com/api/user/list';
const WS_URL   = 'wss://api-mike-ws.runaesike.com/';
const MAX_VOL  = 500;

// ─── Responsive ───────────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SCALE = 1.35;
const sw = (n: number) => Math.round((SCREEN_W / 390) * n * SCALE);
const sh = (n: number) => Math.round((SCREEN_H / 844) * n * SCALE);
const sf = (n: number) => Math.round((SCREEN_W / 390) * n * SCALE / PixelRatio.getFontScale());
const PAD    = sw(16);
const GAP    = sw(12);
const RADIUS = sw(18);

// ─── Types ────────────────────────────────────────────────────────────────────
type MicData = {
  username: string;
  radius: number;
  volume: number;
  enabled: boolean;
  status: string;
  serverId: string | null;
  x: number; y: number; z: number;
};

type UserListItem = { gamertag: string; avatarUrl: string };
type NearbyPlayer = MicData & { avatarUrl: string; distance: number };

// ─── Distance (Y weight 50% กันบิน) ──────────────────────────────────────────
function calcDist(a: MicData, b: MicData): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 0.5;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Animated Card ────────────────────────────────────────────────────────────
function AnimatedCard({ children, delay, style }: {
  children: React.ReactNode; delay: number; style?: object;
}) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(sh(12))).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 360, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 360, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();

  const [micData,       setMicData]       = useState<MicData | null>(null);
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([]);
  const [voiceActive,   setVoiceActive]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [isPiP,         setIsPiP]         = useState(false);
  const [pipSupported,  setPipSupported]  = useState(false);

  const socketRef       = useRef<WebSocket | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const peerConns       = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreams    = useRef<Map<string, MediaStream>>(new Map());
  const wsIdMap         = useRef<Map<string, string>>(new Map()); // username → wsId
  const isFetchingRef   = useRef(false);
  const voiceActiveRef  = useRef(false);
  const micDataRef      = useRef<MicData | null>(null);

  // ── Permissions + AppState ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // เช็ค PiP support
    PiPService.isSupported().then(setPipSupported);

    // ขอสิทธิ์ overlay (floating icon)
    VoiceService.hasOverlayPermission().then((has: boolean) => {
      if (!has) VoiceService.requestOverlayPermission();
    });

    // ขอยกเว้น battery optimization — สำคัญมาก ทำให้รัน background ได้
    VoiceService.requestBatteryOptimizationExemption();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setIsPiP(false);
        if (voiceActiveRef.current) {
          InCallManager.start({ media: 'audio' });
          InCallManager.setForceSpeakerphoneOn(true);
        }
      } else if (state === 'background') {
        setIsPiP(true);
      }
    });
    return () => sub.remove();
  }, []);

  // ── WebRTC helpers ────────────────────────────────────────────────────────
  const createPeer = useCallback((wsId: string) => {
    peerConns.current.get(wsId)?.close();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pc: any = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    localStreamRef.current?.getTracks().forEach((t: any) =>
      pc.addTrack(t, localStreamRef.current!)
    );
    pc.ontrack = (e: any) => {
      if (e.streams?.[0]) remoteStreams.current.set(wsId, e.streams[0]);
    };
    pc.onicecandidate = (e: any) => {
      if (e.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate, to: wsId }));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        peerConns.current.delete(wsId);
        remoteStreams.current.delete(wsId);
      }
    };
    peerConns.current.set(wsId, pc);
    return pc;
  }, []);

  const callUser = useCallback(async (wsId: string) => {
    if (!localStreamRef.current) return;
    const pc = createPeer(wsId);
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    socketRef.current?.send(JSON.stringify({ type: 'offer', sdp: offer, to: wsId }));
  }, [createPeer]);

  const handleOffer = useCallback(async (from: string, sdp: any) => {
    if (!localStreamRef.current) return;
    const pc = createPeer(from);
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.send(JSON.stringify({ type: 'answer', sdp: answer, to: from }));
  }, [createPeer]);

  // ── Start Voice System ────────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    if (localStreamRef.current || !user?.user_tag) {
      if (!user?.user_tag) Alert.alert('แจ้งเตือน', 'กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      }) as MediaStream;

      localStreamRef.current = stream;
      InCallManager.start({ media: 'audio' });
      InCallManager.setForceSpeakerphoneOn(true);
      if (Platform.OS === 'android') {
        InCallManager.setKeepScreenOn(true);
        await VoiceService.start(user.user_tag);
      }

      setVoiceActive(true);
      voiceActiveRef.current = true;

      // ── WebSocket ──────────────────────────────────────────────────────
      const connectWs = () => {
        const ws = new WebSocket(WS_URL);
        socketRef.current = ws;

        ws.onopen = () => ws.send(JSON.stringify({ type: 'register', username: user.user_tag }));

        ws.onmessage = async (msg: any) => {
          const data = JSON.parse(msg.data);
          switch (data.type) {
            case 'welcome':
              data.users.forEach((u: any) => {
                wsIdMap.current.set(u.username, u.id);
                callUser(u.id);
              });
              break;
            case 'user-connected':
            case 'user-registered':
              if (data.username) wsIdMap.current.set(data.username, data.id);
              break;
            case 'user-disconnected':
              wsIdMap.current.forEach((id, uname) => {
                if (id === data.id) wsIdMap.current.delete(uname);
              });
              peerConns.current.get(data.id)?.close();
              peerConns.current.delete(data.id);
              remoteStreams.current.delete(data.id);
              break;
            case 'offer':    await handleOffer(data.from, data.sdp); break;
            case 'answer':   peerConns.current.get(data.from)?.setRemoteDescription(new RTCSessionDescription(data.sdp)); break;
            case 'ice-candidate': peerConns.current.get(data.from)?.addIceCandidate(new RTCIceCandidate(data.candidate)); break;
          }
        };

        ws.onclose = () => {
          if (voiceActiveRef.current) setTimeout(connectWs, 3000); // auto reconnect
        };
      };

      connectWs();
      Alert.alert('✅ เปิดระบบเสียงแล้ว', 'กำลังรับฟังผู้เล่นในรัศมี');
    } catch {
      Alert.alert('❌ เปิดไมค์ไม่ได้', 'กรุณาอนุญาตการใช้ไมโครโฟนในการตั้งค่า');
    }
  }, [user?.user_tag, callUser, handleOffer]);

  // ── Stop Voice System ─────────────────────────────────────────────────────
  const stopVoice = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    peerConns.current.forEach(pc => pc.close());
    peerConns.current.clear();
    remoteStreams.current.clear();
    wsIdMap.current.clear();
    InCallManager.stop();
    if (Platform.OS === 'android') VoiceService.stop();
    setVoiceActive(false);
    voiceActiveRef.current = false;
  }, []);

  // ── Polling: fetch + คำนวณ nearby + ปรับ volume ──────────────────────────
  const fetchAndProcess = useCallback(async (tag: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setLoading(true);

      // 1. ข้อมูลตัวเอง
      const myRes = await fetch(`${API_MIC}/${tag}`);
      if (!myRes.ok) return;
      const myData: MicData = await myRes.json();
      micDataRef.current = myData;
      setMicData(myData);

      // ปิด/เปิด local mic track ตาม enabled + status
      const myMicActive = myData.status === 'online' && myData.enabled;
      localStreamRef.current?.getTracks().forEach((t: any) => {
        if (t.kind === 'audio') t.enabled = myMicActive;
      });

      // 2. คำนวณ nearby เฉพาะตอน online
      const nearby: NearbyPlayer[] = [];
      if (myData.status === 'online' && myData.serverId) {
        const listRes = await fetch(API_LIST);
        if (listRes.ok) {
          const allUsers: UserListItem[] = await listRes.json();

          await Promise.allSettled(
            allUsers
              .filter(u => u.gamertag.toLowerCase() !== tag.toLowerCase())
              .map(async (u) => {
                try {
                  const res = await fetch(`${API_MIC}/${u.gamertag}`);
                  if (!res.ok) return;
                  const other: MicData = await res.json();

                  // ต้อง online + server เดียวกัน
                  if (other.status !== 'online' || other.serverId !== myData.serverId) return;

                  const dist = calcDist(myData, other);
                  if (dist > myData.radius || dist > other.radius) return;

                  nearby.push({ ...other, avatarUrl: u.avatarUrl, distance: dist });

                  // ── ปรับ volume remote stream ──────────────────────────
                  const wsId = wsIdMap.current.get(other.username);
                  if (wsId) {
                    const stream = remoteStreams.current.get(wsId);
                    if (stream) {
                      const maxR    = Math.min(myData.radius, other.radius);
                      const fade    = Math.max(0, 1 - dist / maxR);
                      const curved  = Math.pow(fade, 1.5);
                      const volScale = Math.max(1, Math.min(MAX_VOL, other.volume)) / MAX_VOL;
                      const finalVol = curved * volScale * 1.6;
                      const active   = other.enabled && other.status === 'online' && finalVol > 0.01;
                      stream.getTracks().forEach((t: any) => { t.enabled = active; });
                    }
                  }
                } catch { /* ignore */ }
              })
          );

          // ปิด remote ที่ไม่อยู่ใน nearby
          wsIdMap.current.forEach((wsId, uname) => {
            const inRange = nearby.some(p => p.username === uname);
            if (!inRange) {
              remoteStreams.current.get(wsId)?.getTracks().forEach((t: any) => { t.enabled = false; });
            }
          });
        }
      } else {
        // offline → ปิดทุก remote
        remoteStreams.current.forEach(stream =>
          stream.getTracks().forEach((t: any) => { t.enabled = false; })
        );
      }

      setNearbyPlayers(nearby);
    } catch (e) {
      console.warn('fetchAndProcess:', e);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // ── Polling interval ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.user_tag) {
      setMicData(null);
      setNearbyPlayers([]);
      return;
    }
    fetchAndProcess(user.user_tag);
    const iv = setInterval(() => fetchAndProcess(user.user_tag), 1000);
    return () => {
      clearInterval(iv);
      stopVoice();
    };
  }, [user?.user_tag, fetchAndProcess, stopVoice]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isAvatarUrl = user?.user_avatar?.startsWith('http');
  const micOn       = micData?.enabled ?? false;
  const rawVol      = !user ? 0 : (micData?.volume ?? 0);
  const fillPct     = Math.min((rawVol / MAX_VOL) * 100, 100);

  if (isPiP) {
    return (
      <View style={s.pipContainer}>
        <View style={[s.pipDot, { backgroundColor: voiceActive ? '#22c55e' : '#ef4444' }]} />
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090909" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: PAD,
          paddingTop:    Math.max(insets.top,    PAD) + sh(6),
          paddingBottom: Math.max(insets.bottom, PAD) + sh(6),
          gap: GAP,
        }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. ระบบสื่อสาร ── */}
        <AnimatedCard delay={0} style={s.card}>
          <Text style={s.label}>ระบบสื่อสาร</Text>

          <TouchableOpacity
            style={[s.pill, voiceActive && s.pillOn, { marginTop: sh(10) }]}
            onPress={voiceActive ? stopVoice : startVoice}
            activeOpacity={0.75}
            disabled={!user}
          >
            <Text style={[s.pillText, { color: voiceActive ? '#22c55e' : '#666' }]}>
              {voiceActive ? '🔊 เสียงเปิดอยู่ ✓  (แตะเพื่อปิด)' : '🔇 แตะเพื่อเปิดระบบเสียง'}
            </Text>
          </TouchableOpacity>

          <View style={[s.pill, micOn && s.pillOn, { marginTop: sh(10) }]}>
            <Text style={[s.pillText, { color: micOn ? '#22c55e' : '#ef4444' }]}>
              {micData?.status === 'online'
                ? micOn ? '🎙 ไมค์เปิด' : '🔇 ไมค์ปิด (ในเกม)'
                : '⚫ ออฟไลน์'}
            </Text>
          </View>

          {voiceActive && (
            <TouchableOpacity
              style={[s.pill, { marginTop: sh(10), borderColor: '#3b82f655', backgroundColor: '#0a0f1c' }]}
              onPress={() => PiPService.enter()}
              activeOpacity={0.75}
            >
              <Text style={[s.pillText, { color: '#3b82f6' }]}>
                📱 ใช้งานหลังจอ (กดเพื่อย่อ)
              </Text>
            </TouchableOpacity>
          )}
        </AnimatedCard>

        {/* ── 2. ผู้ใช้ ── */}
        <AnimatedCard delay={80} style={s.card}>
          <View style={s.userRow}>
            <View style={s.avatarWrap}>
              {user && isAvatarUrl
                ? <Image source={{ uri: user.user_avatar }} style={s.avatarImg} />
                : <Text style={{ fontSize: sf(26) }}>{user?.user_avatar || '🎮'}</Text>
              }
            </View>
            <Text style={s.userName}>{user?.user_tag || 'ยังไม่ได้เข้าสู่ระบบ'}</Text>
          </View>
        </AnimatedCard>

        {/* ── 3. ระยะไมค์ ── */}
        <AnimatedCard delay={160} style={s.card}>
          <Text style={s.label}>ระยะไมค์</Text>
          <View style={[s.rowBetween, { marginTop: sh(10), alignItems: 'flex-end' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: sw(4) }}>
              <Text style={s.distValue}>
                {!user ? '0' : micData != null ? micData.radius.toFixed(1) : '—'}
              </Text>
              <Text style={s.distUnit}>m</Text>
            </View>
            <View style={[s.liveBadge, loading && { opacity: 0.5 }]}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>{loading ? '...' : 'LIVE'}</Text>
            </View>
          </View>
        </AnimatedCard>

        {/* ── 4. ระดับเสียง ── */}
        <AnimatedCard delay={240} style={[s.card, { gap: sh(16) }]}>
          <View style={s.rowBetween}>
            <Text style={s.label}>ระดับเสียง</Text>
            <Text style={s.volNumber}>{rawVol}</Text>
          </View>
          <View style={s.sliderTrack}>
            <View style={[s.sliderFill, { width: `${fillPct}%` as any }]} />
            <View style={[s.sliderThumb, { left: `${Math.min(fillPct, 91)}%` as any }]} />
          </View>
        </AnimatedCard>

        {/* ── 5. ผู้เล่นใกล้เคียง ── */}
        <AnimatedCard delay={320} style={[s.card, { gap: sh(12) }]}>
          <View style={s.rowBetween}>
            <Text style={s.label}>ผู้เล่นใกล้เคียง</Text>
            <View style={s.countBadge}>
              <Text style={s.countText}>{nearbyPlayers.length} คน</Text>
            </View>
          </View>

          {nearbyPlayers.length === 0 ? (
            <Text style={s.emptyText}>
              {!user
                ? 'กรุณาเข้าสู่ระบบ'
                : micData?.status !== 'online'
                  ? 'ยังไม่ได้อยู่ในเกม'
                  : 'ไม่มีผู้เล่นในรัศมี'}
            </Text>
          ) : (
            nearbyPlayers.map((p) => (
              <View key={p.username} style={s.playerRow}>
                <View style={[s.playerAvatar, { borderColor: p.enabled ? '#22c55e' : '#ef4444' }]}>
                  {p.avatarUrl
                    ? <Image source={{ uri: p.avatarUrl }} style={s.playerAvatarImg} />
                    : <Text style={{ fontSize: sf(18) }}>🎮</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.playerName}>{p.username}</Text>
                  <Text style={s.playerDist}>{p.distance.toFixed(1)} m ห่าง</Text>
                </View>
                <View style={[s.micBadge, { backgroundColor: p.enabled ? '#0a1c0d' : '#1a0808' }]}>
                  <Text style={{ color: p.enabled ? '#22c55e' : '#ef4444', fontSize: sf(11), fontWeight: '700' }}>
                    {p.enabled ? '🎙 ON' : '🔇 OFF'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </AnimatedCard>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090909' },
  card: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: RADIUS, paddingHorizontal: PAD, paddingVertical: sh(18),
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#555', fontSize: sf(15), fontWeight: '600', letterSpacing: 0.3 },
  pill: {
    borderWidth: 1.5, borderColor: '#252525', backgroundColor: '#161616',
    borderRadius: sw(50), paddingHorizontal: sw(20), paddingVertical: sh(14), alignItems: 'center',
  },
  pillOn:   { borderColor: '#22c55e55', backgroundColor: '#0a1c0d' },
  pillText: { fontSize: sf(15), fontWeight: '700' },
  userRow:  { flexDirection: 'row', alignItems: 'center', gap: sw(14) },
  avatarWrap: {
    width: sw(54), height: sw(54), borderRadius: sw(27),
    backgroundColor: '#161616', borderWidth: 2.5, borderColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
  },
  avatarImg: { width: sw(54), height: sw(54) },
  userName:  { color: '#fff', fontSize: sf(18), fontWeight: '800', flexShrink: 1, flexWrap: 'wrap' },
  distValue: { color: '#fff', fontSize: sf(36), fontWeight: '800', lineHeight: sf(40) },
  distUnit:  { color: '#444', fontSize: sf(20), fontWeight: '600', lineHeight: sf(40) },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: sw(6),
    backgroundColor: '#1a0808', borderWidth: 1, borderColor: '#ef444430',
    borderRadius: sw(10), paddingHorizontal: sw(12), paddingVertical: sh(8),
  },
  liveDot:  { width: sw(8), height: sw(8), borderRadius: sw(4), backgroundColor: '#ef4444' },
  liveText: { color: '#ef4444', fontSize: sf(14), fontWeight: '800' },
  volNumber: { color: '#22c55e', fontSize: sf(22), fontWeight: '700' },
  sliderTrack: { height: sh(10), backgroundColor: '#1e1e1e', borderRadius: 99 },
  sliderFill:  { position: 'absolute', height: sh(10), backgroundColor: '#22c55e', borderRadius: 99, left: 0 },
  sliderThumb: {
    position: 'absolute', width: sw(28), height: sw(28), borderRadius: sw(14),
    backgroundColor: '#22c55e', top: -sh(9),
    shadowColor: '#22c55e', shadowOpacity: 0.6, shadowRadius: sw(8), elevation: 6,
  },
  countBadge: {
    backgroundColor: '#161616', borderRadius: sw(20),
    paddingHorizontal: sw(12), paddingVertical: sh(4),
    borderWidth: 1, borderColor: '#252525',
  },
  countText:   { color: '#22c55e', fontSize: sf(13), fontWeight: '700' },
  emptyText:   { color: '#333', fontSize: sf(14), textAlign: 'center', paddingVertical: sh(12) },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: sw(12),
    paddingVertical: sh(8), borderTopWidth: 1, borderTopColor: '#1a1a1a',
  },
  playerAvatar: {
    width: sw(44), height: sw(44), borderRadius: sw(22),
    backgroundColor: '#161616', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  playerAvatarImg: { width: sw(44), height: sw(44) },
  playerName:  { color: '#fff', fontSize: sf(15), fontWeight: '700' },
  playerDist:  { color: '#555', fontSize: sf(12), marginTop: sh(2) },
  micBadge:    { borderRadius: sw(8), paddingHorizontal: sw(8), paddingVertical: sh(4) },
  pipContainer: { flex: 1, backgroundColor: '#090909', alignItems: 'center', justifyContent: 'center' },
  pipDot:       { width: 52, height: 52, borderRadius: 26 },
});