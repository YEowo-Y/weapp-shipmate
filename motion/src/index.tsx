import { Composition, registerRoot } from 'remotion';
import { Tutorial } from './Tutorial';
import { DURATION, FPS, lessons } from './lessons';

function Root() {
  return <>{lessons.map(lesson => <Composition key={lesson.id} id={lesson.id} component={Tutorial} defaultProps={{ lesson }} width={1920} height={1080} fps={FPS} durationInFrames={DURATION} />)}</>;
}

registerRoot(Root);
