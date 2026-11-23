import {registerRootComponent} from 'expo';
import App from './App';

// Keep the native entry explicit: both phone platforms use the existing Vetit UI.
registerRootComponent(App);
