export type FirebaseWebConfig={
  apiKey:string;
  authDomain:string;
  projectId:string;
  storageBucket:string;
  messagingSenderId:string;
  appId:string;
};

const value=(input:string|undefined)=>input?.trim()??"";

export function firebaseWebConfig():FirebaseWebConfig|null{
  const config:FirebaseWebConfig={
    apiKey:value(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain:value(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId:value(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket:value(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId:value(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId:value(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
  return Object.values(config).every(Boolean)?config:null;
}

export function firebaseConfigurationStatus(){
  const config=firebaseWebConfig();
  return config?{configured:true as const,projectId:config.projectId}:{configured:false as const,projectId:undefined};
}
