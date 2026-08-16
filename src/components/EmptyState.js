import React from 'react';
import { View, Text } from 'react-native';
import { c, ff, alpha } from '../theme/tokens';
import { Button, Icon } from './index';

/**
 * Consistent empty state — a tinted icon tile, a title, one explanatory line,
 * and (optionally) a primary call-to-action. Replaces the "icon + one grey
 * line" empties so every dead-end offers a way forward.
 */
export function EmptyState({ icon = 'sparkles', tone, title, message, actionLabel, onAction, compact }) {
  const t = tone || c('primary');
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 24 : 40, paddingHorizontal: 24, gap: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: alpha(t, 0.14), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={t} />
      </View>
      {title ? <Text style={{ fontSize: 16, fontFamily: ff.semi, color: c('fg'), textAlign: 'center' }}>{title}</Text> : null}
      {message ? <Text style={{ fontSize: 13, color: c('fgMuted'), textAlign: 'center', lineHeight: 19, maxWidth: 300 }}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 4 }}>
          <Button icon="plus" onPress={onAction}>{actionLabel}</Button>
        </View>
      ) : null}
    </View>
  );
}
