'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, LoginRequest } from '@talentpulse/shared';
import { Activity, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginRequest) => {
    setServerError(null);
    try {
      await login(data);
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Authentication failed. Please check your credentials.');
      }
    }
  };

  const handleFillDemoAdmin = () => {
    setValue('email', 'admin@acme.com', { shouldValidate: true });
    setValue('password', 'AdminPass123!', { shouldValidate: true });
  };

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-[#0B0F19]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Activity className="h-7 w-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-white">
          Sign in to TalentPulse AI
        </h2>
        <p className="mt-1 text-center text-xs text-gray-400">
          Agentic recruitment intelligence and programmatic budget optimization
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#0E131F] py-8 px-4 shadow-xl border border-gray-800 sm:rounded-xl sm:px-10">
          {serverError && (
            <div className="mb-5 flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800/50 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{serverError}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <Input
                label="Work Email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <div>
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isSubmitting}
            >
              <span>Sign in</span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-800/80 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleFillDemoAdmin}
              className="text-xs text-gray-400 hover:text-blue-400 text-center transition-colors font-medium"
            >
              Fill Demo Admin Credentials (admin@acme.com)
            </button>

            <div className="text-center text-xs text-gray-400">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-blue-400 hover:underline font-medium">
                Create an organization
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
