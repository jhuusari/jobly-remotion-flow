import React from 'react';
import {Composition} from 'remotion';
import {AdVideo, AdVideoProps} from './AdVideo';

const width = 1080;
const height = 1920;
const fps = 30;
const durationInFrames = 180;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition<AdVideoProps>
        id="AdVideo"
        component={AdVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
        defaultProps={{
          company: 'Company',
          title: 'Job Title',
          logoSrc: undefined,
          location: 'Helsinki',
          audioSrc: undefined,
          offers: ['Great team', 'Career growth', 'Flexible hours'],
          expects: ['Customer focus', 'Analytics', 'Coaching mindset']
        }}
      />
    </>
  );
};
