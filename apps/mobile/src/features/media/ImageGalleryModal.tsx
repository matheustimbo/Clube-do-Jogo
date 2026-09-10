import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { colors, radii, spacing } from '@/theme';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function ImageGalleryModal({ visible, title, images, activeIndex, onActiveIndexChange, onClose }: {
  visible: boolean;
  title: string;
  images: string[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const window = Dimensions.get('window');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomStart = useRef(1);
  const panStart = useRef({ x: 0, y: 0 });
  const swipeStart = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [visible, activeIndex]);

  if (!visible || !images.length) return null;

  const select = (index: number) => {
    const next = (index + images.length) % images.length;
    onActiveIndexChange(next);
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => { zoomStart.current = zoom; })
    .onUpdate(event => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomStart.current * event.scale));
      setZoom(next);
    })
    .onEnd(() => { if (zoom <= MIN_ZOOM) setPan({ x: 0, y: 0 }); });

  const pan1 = Gesture.Pan()
    .runOnJS(true)
    .minPointers(1)
    .maxPointers(1)
    .onStart(() => {
      panStart.current = pan;
      swipeStart.current = 0;
    })
    .onUpdate(event => {
      if (zoom > MIN_ZOOM) {
        setPan({ x: panStart.current.x + event.translationX, y: panStart.current.y + event.translationY });
      } else {
        swipeStart.current = event.translationX;
      }
    })
    .onEnd(() => {
      if (zoom <= MIN_ZOOM && Math.abs(swipeStart.current) > 60) {
        select(activeIndex + (swipeStart.current > 0 ? -1 : 1));
      }
      swipeStart.current = 0;
    });

  const composed = Gesture.Simultaneous(pinch, pan1);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop} accessible={false}>
        <GestureDetector gesture={composed}>
          <View style={[styles.viewport, { height: window.height * 0.62 }]}>
            <Image
              source={{ uri: images[activeIndex] }}
              style={[styles.image, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }]}
              contentFit="contain"
              accessibilityLabel={`Imagem ${activeIndex + 1} de ${images.length} de ${title}`}
            />
          </View>
        </GestureDetector>

        {images.length > 1 ? (
          <>
            <Pressable onPress={() => select(activeIndex - 1)} accessibilityRole="button" accessibilityLabel="Imagem anterior" style={[styles.navButton, styles.navLeft]}>
              <Ionicons name="chevron-back" size={26} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => select(activeIndex + 1)} accessibilityRole="button" accessibilityLabel="Próxima imagem" style={[styles.navButton, styles.navRight]}>
              <Ionicons name="chevron-forward" size={26} color={colors.white} />
            </Pressable>
          </>
        ) : null}

        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar galeria" hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>

        <View style={styles.toolbar}>
          <Pressable
            onPress={() => setZoom(current => Math.max(MIN_ZOOM, Number((current - 0.5).toFixed(2))))}
            disabled={zoom <= MIN_ZOOM}
            accessibilityRole="button"
            accessibilityLabel="Reduzir zoom"
            style={[styles.toolButton, zoom <= MIN_ZOOM && styles.toolButtonDisabled]}
          >
            <Ionicons name="remove" size={18} color={colors.white} />
          </Pressable>
          <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
          <Pressable
            onPress={() => setZoom(current => Math.min(MAX_ZOOM, Number((current + 0.5).toFixed(2))))}
            disabled={zoom >= MAX_ZOOM}
            accessibilityRole="button"
            accessibilityLabel="Ampliar zoom"
            style={[styles.toolButton, zoom >= MAX_ZOOM && styles.toolButtonDisabled]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
          </Pressable>
        </View>

        {images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
            {images.map((url, index) => (
              <Pressable key={`${url}-${index}`} onPress={() => select(index)} accessibilityRole="button" accessibilityLabel={`Abrir imagem ${index + 1}`}>
                <Image source={{ uri: url }} style={[styles.thumb, index === activeIndex && styles.thumbActive]} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  viewport: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  navButton: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  navLeft: { left: spacing.sm },
  navRight: { right: spacing.sm },
  close: { position: 'absolute', right: spacing.md, top: spacing.xxl, width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  toolButton: { width: 32, height: 32, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  toolButtonDisabled: { opacity: 0.4 },
  zoomLabel: { color: colors.white, fontSize: 11, fontWeight: '800', minWidth: 42, textAlign: 'center' },
  thumbRow: { maxHeight: 60 },
  thumb: { width: 76, height: 52, borderRadius: radii.sm, opacity: 0.55 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: colors.white },
});
