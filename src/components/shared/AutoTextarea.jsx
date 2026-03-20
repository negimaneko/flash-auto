import { useRef, useEffect } from "react";

export function AutoTextarea({value, ...props}) {
  const ref = useRef(null);
  useEffect(()=>{
    if(ref.current){ref.current.style.height="auto";ref.current.style.height=ref.current.scrollHeight+"px";}
  },[value]);
  return <textarea ref={ref} value={value} {...props} />;
}
