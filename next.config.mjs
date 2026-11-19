/** @type {import('next').NextConfig} */
const nextConfig = {
  // ให้ไฟล์ในโฟลเดอร์ knowledge/ ถูกแพ็กไปกับ serverless function บน Vercel
  outputFileTracingIncludes: {
    '/api/**/*': ['./knowledge/**/*'],
  },
  serverExternalPackages: ['unpdf'],
};
export default nextConfig;
