import React,{useState} from 'react';
import {Image,Text,View,type StyleProp,type ImageStyle,type ViewStyle} from 'react-native';
type Props={uri?:string|null;label:string;fallback:string;style:StyleProp<ImageStyle>;fallbackStyle?:StyleProp<ViewStyle>};
// A changed URI starts a new attempt; stale error events cannot hide its image.
export function ProductPhoto(props:Props){return <PhotoAttempt key={props.uri||'placeholder'} {...props}/>;}
export function PhotoAttempt({uri,label,fallback,style,fallbackStyle}:Props){
 const [failed,setFailed]=useState(false);
 return uri&&!failed?<Image source={{uri}} style={style} resizeMode="cover" accessibilityLabel={label} onError={()=>setFailed(true)}/>
  :<View style={[style as StyleProp<ViewStyle>,fallbackStyle]} accessibilityLabel={fallback}><Text>{fallback}</Text></View>;
}
