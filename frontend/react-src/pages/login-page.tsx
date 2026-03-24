import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import api from '@/lib/api-client'
import { isAuthenticated, persistAdminToken } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/state/app-store'

const schema = z.object({
  password: z.string().min(1),
})

type LoginForm = z.infer<typeof schema>

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notify = useAppStore((state) => state.notify)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: '',
    },
  })

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/admin', { replace: true })
    }
  }, [navigate])

  async function onSubmit(values: LoginForm) {
    try {
      const response = await api.post<{ success?: boolean; token?: string; error?: string }>(
        '/admin/login',
        {
          password: values.password,
        },
      )

      if (response.success && response.token) {
        persistAdminToken(response.token)
        notify(String(t('login.loginSuccess')), 'success')
        navigate('/admin', { replace: true })
        return
      }

      notify(response.error || String(t('login.wrongPassword')), 'error')
    } catch {
      notify(String(t('login.loginFailed')), 'error')
    }
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <Card className="w-full max-w-md overflow-hidden">
        <CardHeader className="border-none pb-0">
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('route.admin')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label htmlFor="password">{t('login.password')}</Label>
              <div data-testid="login-password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={String(t('login.passwordPlaceholder'))}
                  {...register('password')}
                />
              </div>
              {errors.password ? (
                <p className="mt-2 text-sm text-rose-600">{t('login.passwordRequired')}</p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              data-testid="login-submit"
            >
              {isSubmitting ? t('common.loading') : t('login.login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
