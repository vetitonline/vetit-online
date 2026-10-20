import React,{useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {createNativeBuyerOrders} from './buyer-orders.js';
import type {NativeModerationSession} from './moderation-session.js';
import type {OrderWorkspaceState} from '../../src/lib/buyer/order-workspace.js';
import {workspaceCopy,orderStatusLabel,formatWorkspaceMoney} from '../../src/lib/marketplace/workspace-copy.js';
export function NativeBuyerOrders({session,apiBaseUrl,testApiOrigin,language='en'}:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;language?:string}){
 const copy=workspaceCopy(language);
 const blank:OrderWorkspaceState={phase:'idle',mode:'list',orders:[],detail:null,nextCursor:null};
 const sourceKey=apiBaseUrl+'|'+testApiOrigin;
 const [saved,setState]=useState({source:session,sourceKey,value:blank});
 const state=saved.source===session&&saved.sourceKey===sourceKey?saved.value:blank;
 const host=useRef<ReturnType<typeof createNativeBuyerOrders>|null>(null);
 useEffect(()=>{let active=true;const controller=createNativeBuyerOrders({session,apiBaseUrl,testApiOrigin,render:value=>{if(active)setState({source:session,sourceKey,value});}});host.current=controller;void controller.load();
  const listener=AppState.addEventListener('change',value=>{if(value==='active')void controller.load();else controller.clear();});
  return()=>{active=false;listener.remove();controller.dispose();if(host.current===controller)host.current=null;};
 },[session,apiBaseUrl,testApiOrigin]);
 const button=(label:string,onPress:()=>void)=><Pressable accessibilityRole="button" disabled={state.phase==='loading'} onPress={onPress}><Text>{label}</Text></Pressable>;
 return <View style={{gap:12}}><Text accessibilityRole="header">{copy.orders}</Text><Text>{copy.ordersIntro}</Text>
  {state.phase==='loading'&&<Text accessibilityLiveRegion="polite">{copy.loading}</Text>}
  {state.phase==='signin'&&<Text>{copy.signin}</Text>}
  {state.phase==='empty'&&<Text>{copy.empty}</Text>}
  {state.phase==='notfound'&&<Text>{copy.notfound}</Text>}
  {state.phase==='error'&&<Text accessibilityRole="alert">{copy.error}</Text>}
  {state.mode==='list'&&state.orders.map(order=><View key={order.id} style={{gap:6}}><Text>{orderStatusLabel(order.order_status,language)} · {formatWorkspaceMoney(order.total_minor,order.currency_code,language)}</Text><Text>{copy.date}: {order.created_at}</Text>{button(copy.view,()=>void host.current?.load({orderId:order.id}))}</View>)}
  {state.detail&&<View style={{gap:6}}><Text>{orderStatusLabel(state.detail.order.order_status,language)}</Text><Text>{copy.total}: {formatWorkspaceMoney(state.detail.order.total_minor,state.detail.order.currency_code,language)}</Text>
   <Text>{copy.items}</Text>{state.detail.items.length?state.detail.items.map(item=><Text key={item.id}>{item.title_snapshot} · {copy.qty}: {item.quantity} · {formatWorkspaceMoney(item.unit_price_minor,item.currency_code,language)}</Text>):<Text>{copy.noItems}</Text>}
   <Text>{copy.tracking}</Text>{state.detail.fulfilments.length?state.detail.fulfilments.map(item=><View key={item.id}><Text>{orderStatusLabel(item.status,language)}</Text>{item.carrier&&<Text>{copy.carrier}: {item.carrier}</Text>}{item.tracking_reference&&<Text>{copy.reference}: {item.tracking_reference}</Text>}</View>):<Text>{copy.noTracking}</Text>}
   {state.detail.truncated&&<Text>{copy.partial}</Text>}{button(copy.back,()=>void host.current?.load())}
  </View>}
  {state.mode==='list'&&state.nextCursor&&button(copy.more,()=>void host.current?.load({more:true}))}
  {button(copy.retry,()=>void host.current?.retry())}
 </View>;
}
