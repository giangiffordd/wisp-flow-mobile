import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Filter, FeTurbulence, FeColorMatrix, Rect } from 'react-native-svg';

export default function GrainOverlay({ opacity = 0.07 }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Filter id="grain" x="0%" y="0%" width="100%" height="100%">
            <FeTurbulence
              type="fractalNoise"
              baseFrequency="0.72"
              numOctaves="4"
              stitchTiles="stitch"
            />
            <FeColorMatrix type="saturate" values="0" />
          </Filter>
        </Defs>
        <Rect width="100%" height="100%" filter="url(#grain)" opacity={opacity} />
      </Svg>
    </View>
  );
}
