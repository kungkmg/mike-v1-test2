import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  PixelRatio,
  Image,
} from 'react-native';
import { useUser } from '@/context/UserContext';

// ─── Responsive ───────────────────────────────────────────────────────────────
const { width: W, height: H } = Dimensions.get('window');
const sw = (n: number) => Math.round((W / 390) * n * 1.35);
const sh = (n: number) => Math.round((H / 844) * n * 1.35);
const sf = (n: number) => Math.round((W / 390) * n * 1.35 / PixelRatio.getFontScale());

const API_BASE = 'https://arenacore.runaesike.com';

export default function LoginScreen() {
  const { user, setUser, logout, isLoading } = useUser();
  const [code,        setCode]        = useState(['', '', '', '', '', '']);
  const [loginLoading, setLoginLoading] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // ── OTP handlers ──────────────────────────────────────────────────────────
  const handleChange = (text: string, index: number) => {
    const val = text.replace(/[^0-9]/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = val;
    setCode(newCode);
    if (val && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      Alert.alert('แจ้งเตือน', 'กรุณากรอกโค้ด 6 หลักให้ครบ');
      return;
    }
    setLoginLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/core/code-login?code=${fullCode}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert('เข้าสู่ระบบไม่สำเร็จ', data.error || 'โค้ดไม่ถูกต้องหรือหมดอายุแล้ว');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      // ── setUser → Context อัปเดต → index.tsx เห็นทันที ──────────────────
      setUser({
        user_tag:     data.user_tag,
        user_money:   data.user_money,
        user_avatar:  data.user_avatar,
        user_expiry:  data.user_expiry,
        is_permanent: data.is_permanent,
        is_active:    data.is_active,
      });

    } catch {
      Alert.alert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อ server ได้');
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={ls.screen}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // ── หน้าข้อมูล User ───────────────────────────────────────────────────────
  if (user) {
    const isUrl = user.user_avatar?.startsWith('http');
    return (
      <View style={ls.screen}>
        <View style={ls.card}>
          <View style={ls.avatarWrap}>
            {isUrl
              ? <Image source={{ uri: user.user_avatar }} style={ls.avatarImg} />
              : <Text style={{ fontSize: sf(32) }}>{user.user_avatar || '🎮'}</Text>
            }
          </View>

          <Text style={ls.welcomeLabel}>ยินดีต้อนรับ</Text>
          <Text style={ls.userTag}>{user.user_tag}</Text>

          <View style={ls.divider} />

          <View style={ls.infoRow}>
            <Text style={ls.infoLabel}>💰 เครดิต</Text>
            <Text style={ls.infoValue}>{user.user_money.toLocaleString()} บาท</Text>
          </View>
          <View style={ls.infoRow}>
            <Text style={ls.infoLabel}>📦 แพ็กเกจหมด</Text>
            <Text style={ls.infoValue}>{user.user_expiry}</Text>
          </View>
          <View style={ls.infoRow}>
            <Text style={ls.infoLabel}>✅ สถานะ</Text>
            <Text style={[ls.infoValue, { color: user.is_active ? '#22c55e' : '#ef4444' }]}>
              {user.is_active ? 'ใช้งานได้' : 'ถูกระงับ'}
            </Text>
          </View>

          {/* logout → Context เคลียร์ → index.tsx เคลียร์ทันที */}
          <TouchableOpacity style={ls.logoutBtn} onPress={logout}>
            <Text style={ls.logoutText}>ออกจากระบบ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── หน้า Login OTP ────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={ls.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={ls.card}>
        <Text style={ls.title}>🔐 เข้าสู่ระบบ</Text>
        <Text style={ls.subtitle}>
          กรอกโค้ด 6 หลักจากเว็บไซต์{'\n'}โค้ดมีอายุ 10 นาที
        </Text>

        <View style={ls.otpRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputRefs.current[i] = r; }}
              style={[ls.otpBox, digit ? ls.otpBoxFilled : null]}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={(e) => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity
          style={[ls.loginBtn, loginLoading && ls.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loginLoading}
        >
          {loginLoading
            ? <ActivityIndicator color="#000" />
            : <Text style={ls.loginText}>เข้าสู่ระบบ</Text>
          }
        </TouchableOpacity>

        <Text style={ls.hint}>ไปที่เว็บ → โปรไฟล์ → สร้างโค้ดเข้าสู่ระบบ</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: sw(20),
  },
  card: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: sw(20),
    borderWidth: 1,
    borderColor: '#222',
    padding: sw(28),
    alignItems: 'center',
  },
  avatarWrap: {
    width: sw(72),
    height: sw(72),
    borderRadius: sw(36),
    backgroundColor: '#161616',
    borderWidth: 2.5,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: sh(14),
    overflow: 'hidden',
  },
  avatarImg: { width: sw(72), height: sw(72) },
  welcomeLabel: { fontSize: sf(13), color: '#666', marginBottom: sh(4) },
  userTag: {
    fontSize: sf(22),
    fontWeight: '800',
    color: '#22c55e',
    marginBottom: sh(20),
    textAlign: 'center',
  },
  divider: { width: '100%', height: 1, backgroundColor: '#222', marginBottom: sh(16) },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: sh(14),
  },
  infoLabel: { color: '#888', fontSize: sf(14) },
  infoValue: { color: '#fff', fontSize: sf(14), fontWeight: '600' },
  logoutBtn: {
    marginTop: sh(20),
    width: '100%',
    paddingVertical: sh(14),
    borderRadius: sw(12),
    borderWidth: 1,
    borderColor: '#2a1010',
    backgroundColor: '#1a0808',
    alignItems: 'center',
  },
  logoutText: { color: '#ef4444', fontSize: sf(14), fontWeight: '700' },
  title: { fontSize: sf(22), fontWeight: '700', color: '#fff', marginBottom: sh(8) },
  subtitle: {
    fontSize: sf(13),
    color: '#666',
    textAlign: 'center',
    marginBottom: sh(28),
    lineHeight: sf(20),
  },
  otpRow: { flexDirection: 'row', gap: 8, marginBottom: sh(28), justifyContent: 'center', paddingHorizontal: sw(4) },
  otpBox: {
    width: (W - sw(28) * 2 - sw(4) * 2 - 8 * 5) / 6,
    height: (W - sw(28) * 2 - sw(4) * 2 - 8 * 5) / 6 * 1.2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontSize: sf(20),
    fontWeight: '700',
    textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#22c55e' },
  loginBtn: {
    width: '100%',
    backgroundColor: '#22c55e',
    borderRadius: sw(50),
    paddingVertical: sh(16),
    alignItems: 'center',
    marginBottom: sh(14),
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginText: { color: '#000', fontWeight: '800', fontSize: sf(16) },
  hint: { fontSize: sf(12), color: '#444', textAlign: 'center' },
});