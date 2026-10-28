import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { ROLE_DEFAULT_REDIRECT } from "@/types/auth.types";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          await connectDB();

          const user = await User.findOne({
            email: credentials.email.toLowerCase().trim(),
            isActive: true,
          }).lean();

          if (!user) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.name = token.name;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  // trustHost: true — gunakan host dari setiap request (mis. IP LAN) sebagai
  // URL kanonik NextAuth, sehingga cookie session tetap valid saat aplikasi
  // diakses dari perangkat lain di jaringan LAN (http://<IP-LAPTOP>:3000).
  // Karena ini, NEXTAUTH_URL sengaja TIDAK di-set di .env.local — host request
  // (yang bisa berubah karena DHCP) yang dipakai, bukan host tetap localhost.
  trustHost: true,

  secret: process.env.NEXTAUTH_SECRET,
});

/**
 * Get the default redirect path for a given role.
 * @param {string} role - User role
 * @returns {string} Redirect path
 */
export function getDefaultRedirect(role) {
  return ROLE_DEFAULT_REDIRECT[role] || "/login";
}
