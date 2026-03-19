import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Poppins';

export type AdVideoProps = {
  company: string;
  title: string;
  logoSrc?: string;
  location?: string;
  audioSrc?: string;
  offers: string[];
  expects: string[];
  theme?: {primary?: string; secondary?: string; text?: string; logo_bg?: string};
  lang?: 'fi' | 'en';
  showGuides?: boolean;
  showLogoDebug?: boolean;
};

loadFont();

export const AdVideo: React.FC<AdVideoProps> = ({company, title, logoSrc, location, audioSrc, offers, expects, theme, lang, showGuides, showLogoDebug}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const fade = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
  const bgStart = theme?.primary ?? '#8CBF1A';
  const bgEnd = theme?.secondary ?? '#6EA816';
  const textColor = theme?.text ?? '#FFFFFF';
  const logoBg = theme?.logo_bg ?? 'rgba(255,255,255,0.9)';
  const bubbleScale = computeBubbleScale([...expects, ...offers]);
  const backgroundShift = interpolate(frame, [0, durationInFrames], [0, 1], {extrapolateRight: 'clamp'});
  const backgroundPositionX = `${Math.round(backgroundShift * 100)}%`;
  const backgroundPositionY = `${Math.round(backgroundShift * 100)}%`;
  const animatedBackground = `radial-gradient(120% 120% at 20% 10%, ${lighten(bgStart, 0.16)} 0%, ${bgStart} 34%, ${bgEnd} 100%)`;

  return (
    <AbsoluteFill
      style={{
        ...styles.root,
        backgroundColor: bgEnd,
        backgroundImage: animatedBackground,
        backgroundSize: '150% 150%',
        backgroundPosition: `${backgroundPositionX} ${backgroundPositionY}`,
        color: textColor
      }}
    >
      {audioSrc ? <Audio src={audioSrc} volume={0.15} /> : null}
      <div style={styles.safeArea}>
        <div style={{...styles.card, opacity: fade}}>
        {logoSrc ? (
          <div style={{...styles.logoWrap, backgroundColor: logoBg, outline: showLogoDebug ? '2px solid #00ff00' : 'none'}}>
            <div
              style={{
                ...styles.logoInner,
                outline: showLogoDebug ? '2px solid #0000ff' : 'none',
                backgroundColor: showLogoDebug ? 'rgba(255,255,255,0.12)' : 'transparent'
              }}
            >
              <Img src={logoSrc} style={styles.logo} />
            </div>
          </div>
        ) : null}

        <div style={styles.headerGroup}>
          <div style={styles.company}>{company}</div>
          <div style={styles.title}>{title}</div>
          {location ? (
            <div style={styles.locationRow}>
              <PinIcon color={textColor} />
              <div style={styles.locationText}>{location}</div>
            </div>
          ) : null}
        </div>

        <div style={styles.sectionTitle}>{lang === 'fi' ? 'Odotamme' : 'We Expect'}</div>
        <div style={{...styles.bubbleRow, transform: `scale(${bubbleScale})`, transformOrigin: 'top center'}}>
          {expects.map((text, idx) => (
            <Bubble key={`exp-${text}`} text={text} index={idx} color={textColor} />
          ))}
        </div>

        <div style={styles.sectionTitle}>{lang === 'fi' ? 'Tarjoamme' : 'We Offer'}</div>
        <div style={{...styles.bubbleRow, transform: `scale(${bubbleScale})`, transformOrigin: 'top center'}}>
          {offers.map((text, idx) => (
            <Bubble key={`off-${text}`} text={text} index={idx + expects.length} color={textColor} />
          ))}
        </div>
        </div>
      </div>
      {showGuides ? <SafeZoneOverlay /> : null}
    </AbsoluteFill>
  );
};

const Bubble: React.FC<{text: string; index: number; color: string}> = ({text, index, color}) => {
  const frame = useCurrentFrame();
  const delay = index * 6;
  const appear = interpolate(frame, [0 + delay, 16 + delay], [0, 1], {extrapolateRight: 'clamp'});
  const rise = interpolate(frame, [0 + delay, 22 + delay], [16, 0], {extrapolateRight: 'clamp'});
  const scale = interpolate(frame, [0 + delay, 18 + delay], [0.95, 1], {extrapolateRight: 'clamp'});
  const border = color === '#0B0B0B' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';
  const background = color === '#0B0B0B' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)';
  return (
    <div
      style={{
        ...styles.bubble,
        color,
        border,
        background,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.8)',
        opacity: appear,
        transform: `translateY(${rise}px) scale(${scale})`
      }}
    >
      {text}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'Poppins, system-ui, sans-serif',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  safeArea: {
    paddingTop: 120,
    paddingBottom: 340,
    paddingLeft: 120,
    paddingRight: 120,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center'
  },
  card: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 26
  },
  headerGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6
  },
  logoWrap: {
    width: 250,
    height: 250,
    aspectRatio: 1,
    borderRadius: 25,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
  },
  logoInner: {
    width: 200,
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  logo: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block'
  },
  company: {
    fontSize: 50,
    fontWeight: 700,
    letterSpacing: 0.2,
    textAlign: 'center',
    maxWidth: 980,
    lineHeight: 1.15
  },
  title: {
    fontSize: 42,
    fontWeight: 500,
    textAlign: 'center',
    maxWidth: 900,
    lineHeight: 1.2
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  },
  locationText: {
    fontSize: 34,
    fontWeight: 300,
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 40,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 8
  },
  bubbleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
    maxWidth: 980
  },
  bubble: {
    padding: '16px 30px',
    borderRadius: 999,
    fontSize: 34,
    fontWeight: 300,
    whiteSpace: 'normal',
    textAlign: 'center',
    lineHeight: 1.2,
    maxWidth: 760,
    border: '1px solid rgba(255,255,255,0.9)'
  }
};

function logoStyle(aspect?: number): React.CSSProperties {
  if (!aspect) return styles.logo;
  if (aspect >= 1.4) {
    return {width: 200, height: 140, objectFit: 'contain'};
  }
  if (aspect <= 0.75) {
    return {width: 140, height: 200, objectFit: 'contain'};
  }
  return styles.logo;
}

const SafeZoneOverlay: React.FC = () => {
  return (
    <div style={overlayStyles.container}>
      <div style={overlayStyles.top} />
      <div style={overlayStyles.bottom} />
      <div style={overlayStyles.left} />
      <div style={overlayStyles.right} />
      <div style={overlayStyles.outline} />
    </div>
  );
};

const overlayStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none'
  },
  outline: {
    position: 'absolute',
    left: 120,
    right: 120,
    top: 120,
    bottom: 340,
    border: '2px solid rgba(255,255,255,0.85)',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
    borderRadius: 8
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 120,
    background: 'rgba(255,0,0,0.08)'
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 340,
    background: 'rgba(255,0,0,0.08)'
  },
  left: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 120,
    background: 'rgba(255,0,0,0.08)'
  },
  right: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 120,
    background: 'rgba(255,0,0,0.08)'
  }
};

function computeBubbleScale(items: string[]): number {
  const total = items.join(' ').length;
  const avg = items.length > 0 ? total / items.length : 0;
  if (items.length >= 8 || total > 520 || avg > 60) return 0.88;
  if (items.length >= 7 || total > 460 || avg > 54) return 0.92;
  if (items.length >= 6 || total > 420 || avg > 48) return 0.95;
  return 1;
}

function toRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const cleaned = hex.replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const mix = (value: number) => Math.round(value + (255 - value) * amount);
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

const PinIcon: React.FC<{color: string}> = ({color}) => {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 22c-4-5.333-6-8.667-6-12a6 6 0 1 1 12 0c0 3.333-2 6.667-6 12Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth="1.8" />
    </svg>
  );
};
