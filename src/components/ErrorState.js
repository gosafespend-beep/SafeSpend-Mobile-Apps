import React from 'react';
import { View, Text } from 'react-native';
import { c, ff } from '../theme/tokens';
import { Button, Icon } from './index';

/** Friendly load-failure state with a retry, used in place of an endless spinner. */
export function ErrorState({ onRetry, message = "We couldn't load this.\nCheck your connection and try again." }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c('expense', 0.15), alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="zap" size={22} color={c('expense')} />
      </View>
      <Text style={{ fontSize: 14, color: c('fgMuted'), textAlign: 'center', lineHeight: 20 }}>{message}</Text>
      {onRetry ? <Button variant="outline" icon="trendingUp" onPress={onRetry}>Retry</Button> : null}
    </View>
  );
}
