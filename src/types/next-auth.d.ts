import type { DefaultSession } from 'next-auth';
declare module 'next-auth' { interface Session { user:{id:string;createdAt?:string;emailVerifiedAt?:string}&DefaultSession['user'] } interface User { createdAt?:string; emailVerifiedAt?:string } }
declare module 'next-auth/jwt' { interface JWT { createdAt?:string; emailVerifiedAt?:string } }
