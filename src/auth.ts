import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import { consumeAuthRateLimit } from './lib/rate-limit';
export const { handlers, auth, signIn, signOut } = NextAuth({
 adapter: PrismaAdapter(prisma), trustHost: true, session:{strategy:'jwt',maxAge:30*24*60*60},
 providers:[GitHub,Google,Credentials({credentials:{email:{type:'email'},password:{type:'password'}},async authorize(credentials, request){
  if (!(await consumeAuthRateLimit(request, 'login', 10, 15 * 60 * 1000))) return null;
  const email=String(credentials?.email??'').trim().toLowerCase(),password=String(credentials?.password??'');
  if(!email||!password)return null;const user=await prisma.user.findUnique({where:{email}});
  if(!user?.passwordHash||!user.emailVerified||!(await bcrypt.compare(password,user.passwordHash)))return null;
  return {id:user.id,email:user.email,name:user.name,image:user.image,createdAt:user.createdAt.toISOString(),emailVerifiedAt:user.emailVerified.toISOString()};
 }})],
 callbacks:{async jwt({token,user}){if(user){const u=user as {createdAt?:string|Date;emailVerified?:Date|string|null;emailVerifiedAt?:string};token.createdAt=typeof u.createdAt==='string'?u.createdAt:u.createdAt?.toISOString()??new Date().toISOString();token.emailVerifiedAt=typeof u.emailVerifiedAt==='string'?u.emailVerifiedAt:u.emailVerified instanceof Date?u.emailVerified.toISOString():typeof u.emailVerified==='string'?u.emailVerified:undefined;}return token;},async session({session,token}){if(session.user&&token.sub){session.user.id=token.sub;session.user.createdAt=typeof token.createdAt==='string'?token.createdAt:undefined;session.user.emailVerifiedAt=typeof token.emailVerifiedAt==='string'?token.emailVerifiedAt:undefined;}return session;}},
 pages:{signIn:'/login'},
});
