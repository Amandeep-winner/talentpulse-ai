'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, RegisterRequest } from '@talentpulse/shared';
import { Activity, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAuth } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: {
      organizationName: '',
      name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: RegisterRequest) => {
    setServerError(null);
    try {
      await registerAuth(data);
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Registration failed. Please check your information.');
      }
    }
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
          Create Organization Account
        </h2>
        <p className="mt-1 text-center text-xs text-gray-400">
          Get started with TalentPulse AI Recruitment Intelligence
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
                label="Organization Name"
                placeholder="Acme Recruiting Inc."
                error={errors.organizationName?.message}
                {...register('organizationName')}
              />
            </div>

            <div>
              <Input
                label="Full Name"
                placeholder="Jane Doe"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

            <div>
              <Input
                label="Work Email"
                type="email"
                placeholder="jane@acme.com"
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
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                At least 8 characters with 1 uppercase letter and 1 number
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isSubmitting}
            >
              <span>Create Account</span>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-800/80 text-center text-xs text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
