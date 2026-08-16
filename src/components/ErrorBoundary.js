import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { c, ff } from '../theme/tokens';
import { captureException } from '../lib/errorReporting';

/**
 * Catches render-time exceptions anywhere in the tree so a single bad value can't
 * white-screen the whole app. Shows a friendly recovery screen and reports the
 * error. `resetKey` (if provided) auto-clears the error when it changes.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureException(error, { componentStack: info?.componentStack });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: c('bg'), alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ fontSize: 40 }}>😕</Text>
        <Text style={{ fontSize: 20, fontFamily: ff.bold, color: c('fg'), textAlign: 'center' }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: c('fgMuted'), textAlign: 'center', lineHeight: 21, maxWidth: 320 }}>
          The screen hit an unexpected error. Your data is safe. Try again — if it keeps happening, restart the app.
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          accessibilityRole="button"
          style={({ pressed }) => [{ marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: c('primary') }, pressed && { opacity: 0.9 }]}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontFamily: ff.semi }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
