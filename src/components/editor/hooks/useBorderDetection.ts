import { useRef, useState, useEffect } from 'react';

const BORDER_DETECTION_THRESHOLD = 8; // pixels from edge to detect border hover

export function useBorderDetection(wrapperRef: React.RefObject<HTMLDivElement>) {
  const [isHoveringBorder, setIsHoveringBorder] = useState(false);

  // Check if mouse is near border
  const checkBorderHover = (e: MouseEvent) => {
    if (!wrapperRef.current) return false;

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const mouseX = e.clientX - wrapperRect.left;
    const mouseY = e.clientY - wrapperRect.top;

    const isNearTop = mouseY < BORDER_DETECTION_THRESHOLD;
    const isNearBottom = mouseY > wrapperRect.height - BORDER_DETECTION_THRESHOLD;
    const isNearLeft = mouseX < BORDER_DETECTION_THRESHOLD;
    const isNearRight = mouseX > wrapperRect.width - BORDER_DETECTION_THRESHOLD;

    return isNearTop || isNearBottom || isNearLeft || isNearRight;
  };

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleMouseMove = (e: MouseEvent) => {
      const isOnBorder = checkBorderHover(e);
      setIsHoveringBorder(isOnBorder);
    };

    const handleMouseLeave = () => {
      setIsHoveringBorder(false);
    };

    wrapper.addEventListener('mousemove', handleMouseMove);
    wrapper.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      wrapper.removeEventListener('mousemove', handleMouseMove);
      wrapper.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [wrapperRef]);

  return { isHoveringBorder, checkBorderHover };
}
