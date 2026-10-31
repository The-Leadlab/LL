import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  Database, 
  LineChart, 
  Linkedin, 
  Search, 
  ArrowRight, 
  CheckCircle,
  Mail,
  Phone,
  Smartphone,
  Fingerprint,
  Brain,
  Building,
  Users,
  Target,
  MessageSquare,
  Calendar,
  BarChart,
  Globe,
  Share2,
  Clock,
  Filter,
  Crosshair,
  Shield,
  Award,
  Eye,
  Trophy,
  Rocket,
  TrendingUp,
  PieChart,
  Activity
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { MarketingNav } from '../components/marketing/MarketingNav'
import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLinkedin, faTwitter, faFacebook } from '@fortawesome/free-brands-svg-icons'
export function HomePage() {
  const { t } = useTranslation('marketing')
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  
  // ROI Calculator states
  const [leadVolume, setLeadVolume] = useState(100)
  const [conversionRate, setConversionRate] = useState(32)
  const [averageDealValue, setAverageDealValue] = useState(5000)
  const [costPerLead, setCostPerLead] = useState(2.5)
  const [contactRate, setContactRate] = useState(75)
  const [meetingBookedRate, setMeetingBookedRate] = useState(35)
  const [meetingSatRate, setMeetingSatRate] = useState(25)

  // Calculate ROI
  const calculateMonthlyROI = () => {
    const totalLeadCost = leadVolume * costPerLead
    const contactedLeads = Math.floor(leadVolume * (contactRate / 100))
    const meetingsBooked = Math.floor(contactedLeads * (meetingBookedRate / 100))
    const meetingsSat = Math.floor(meetingsBooked * (meetingSatRate / 100))
    const convertedLeads = Math.floor(meetingsSat * (conversionRate / 100))
    const totalRevenue = convertedLeads * averageDealValue
    const roi = totalRevenue - totalLeadCost
    return {
      roi,
      convertedLeads,
      totalRevenue,
      totalLeadCost,
      contactedLeads,
      meetingsBooked,
      meetingsSat
    }
  }

  useEffect(() => {
    // Add smooth scrolling behavior
    document.documentElement.style.scrollBehavior = 'smooth'

    // Clean up
    return () => {
      document.documentElement.style.scrollBehavior = 'auto'
    }
  }, [])

  const scrollToSection = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView()
    }
  }

  const stats = [
    { number: 300, suffix: '%', text: t('home.stats.leadGeneration') },
    { number: 60, suffix: '%', text: t('home.stats.costReduction') },
    { number: 95, suffix: '%', text: t('home.stats.dataAccuracy') },
    { number: 3, suffix: 'x', text: t('home.stats.roiImprovement') }
  ]

  return (
    <div className="flex w-full min-h-screen flex-col bg-white font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <MarketingNav />

      <main className="w-full flex-1 pt-16">
          <section className="w-full bg-white px-4 py-12 dark:bg-slate-950 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-3xl text-center">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary-600">
                LeadLab
              </p>
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl md:text-5xl">
                {t('home.hero.title')}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-400 md:text-lg">
                {t('home.hero.subtitle')}
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="https://calendly.com/joshua-the-leadlab/15min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-[200px] items-center justify-center rounded-lg bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary-700"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  {t('home.hero.bookMeeting')}
                </a>
                <Link
                  to="/intake"
                  className="inline-flex min-w-[200px] items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                >
                  {t('home.hero.tellUs')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </div>

              {isAuthenticated && (
                <div className="mt-4">
                  <Link
                    to="/dashboard"
                    className="text-sm font-medium text-primary-600 underline-offset-4 hover:underline"
                  >
                    {t('home.hero.openDashboard')}
                  </Link>
                </div>
              )}

              <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-5 text-center dark:border-slate-700/80 dark:bg-slate-900 md:px-4"
                  >
                    <div className="text-2xl font-bold text-primary-600 md:text-3xl">
                      <CountUp end={stat.number} duration={1.2} />
                      {stat.suffix}
                    </div>
                    <p className="mt-2 text-xs leading-snug text-slate-600 dark:text-slate-400 md:text-sm">{stat.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="about" className="w-full bg-slate-50 px-4 py-12 dark:bg-slate-900/60 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <div className="mx-auto mb-10 max-w-2xl text-center">
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                  {t('home.about.title')}
                </h2>
                <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400 md:text-lg">
                  {t('home.about.intro')}
                </p>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Target className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.mission.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.mission.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Eye className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.vision.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.vision.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Shield className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.values.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.values.body')}
                  </p>
                </motion.div>
              </div>

              <div className="mb-8 mt-12 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                  {t('home.about.problemsTitle')}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Clock className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.problems.timeConsuming.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.problems.timeConsuming.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Filter className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.problems.qualification.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.problems.qualification.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Crosshair className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.about.problems.targeting.title')}</h3>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
                    {t('home.about.problems.targeting.body')}
                  </p>
                </motion.div>
              </div>
            </div>
          </section>

          <section className="w-full bg-white px-4 py-12 dark:bg-slate-950 sm:px-6 md:py-14 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <div className="mb-10 text-center">
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                  {t('home.why.title')}
                </h2>
                <p className="mx-auto max-w-3xl text-base text-slate-600 dark:text-slate-400 md:text-lg">
                  {t('home.why.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                {[
                  {
                    icon: <Trophy className="h-6 w-6 text-primary-600" />,
                    title: t('home.why.accuracy.title'),
                    description: t('home.why.accuracy.description')
                  },
                  {
                    icon: <Rocket className="h-6 w-6 text-primary-600" />,
                    title: t('home.why.implementation.title'),
                    description: t('home.why.implementation.description')
                  },
                  {
                    icon: <TrendingUp className="h-6 w-6 text-primary-600" />,
                    title: t('home.why.roi.title'),
                    description: t('home.why.roi.description')
                  }
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0.01, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                      {feature.icon}
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{feature.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section id="services" className="w-full bg-white px-4 py-12 dark:bg-slate-950 sm:px-6 md:py-14 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <div className="mb-10 text-center">
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                  {t('home.how.title')}
                </h2>
                <p className="mx-auto max-w-3xl text-base text-slate-600 dark:text-slate-400 md:text-lg">
                  {t('home.how.subtitle')}
                </p>
              </div>

              <div className="relative">
                <div className="absolute left-0 top-1/2 hidden h-1 w-full -translate-y-1/2 transform bg-primary-100 dark:bg-primary-900/50 md:block" />
                <div className="grid grid-cols-1 gap-5 md:grid-cols-4 md:gap-6">
                  {[
                    {
                      icon: <Target className="h-6 w-6 text-primary-600" />,
                      title: t('home.how.define.title'),
                      description: t('home.how.define.description')
                    },
                    {
                      icon: <Search className="h-6 w-6 text-primary-600" />,
                      title: t('home.how.search.title'),
                      description: t('home.how.search.description')
                    },
                    {
                      icon: <Brain className="h-6 w-6 text-primary-600" />,
                      title: t('home.how.enrich.title'),
                      description: t('home.how.enrich.description')
                    },
                    {
                      icon: <BarChart className="h-6 w-6 text-primary-600" />,
                      title: t('home.how.convert.title'),
                      description: t('home.how.convert.description')
                    }
                  ].map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0.01, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="relative z-10 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                    >
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                        {step.icon}
                      </div>
                      <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-50">{step.title}</h3>
                      <p className="text-slate-600 dark:text-slate-400">{step.description}</p>
                      <div className="absolute right-4 top-4 text-3xl font-bold text-primary-200">
                        {index + 1}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="w-full bg-white dark:bg-slate-950 py-12 md:py-14">
            <div className="mx-auto w-full max-w-7xl">
              <div className="mb-10 text-center">
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                  {t('home.results.title')}
                </h2>
                <p className="mx-auto max-w-3xl text-base text-slate-600 dark:text-slate-400 md:text-lg">
                  {t('home.results.subtitle')}
                </p>
              </div>

              <div className="max-w-4xl mx-auto">
                <motion.div
                  initial={{ opacity: 0.01, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none"
                >
                  <h3 className="text-2xl font-bold mb-6">{t('home.calculator.title')}</h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.monthlyLeadVolume')}</span>
                          <span className="text-primary-600 font-semibold">{t('home.calculator.leadsValue', { value: leadVolume })}</span>
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="1000"
                          step="50"
                          value={leadVolume}
                          onChange={(e) => setLeadVolume(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>100</span>
                          <span>1000</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.costPerLead')}</span>
                          <span className="text-primary-600 font-semibold">${costPerLead}</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.5"
                          value={costPerLead}
                          onChange={(e) => setCostPerLead(parseFloat(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>$1</span>
                          <span>$10</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.contactRate')}</span>
                          <span className="text-primary-600 font-semibold">{contactRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={contactRate}
                          onChange={(e) => setContactRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.meetingBookedRate')}</span>
                          <span className="text-primary-600 font-semibold">{meetingBookedRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={meetingBookedRate}
                          onChange={(e) => setMeetingBookedRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.meetingSatRate')}</span>
                          <span className="text-primary-600 font-semibold">{meetingSatRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={meetingSatRate}
                          onChange={(e) => setMeetingSatRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.conversionRate')}</span>
                          <span className="text-primary-600 font-semibold">{conversionRate}%</span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          step="1"
                          value={conversionRate}
                          onChange={(e) => setConversionRate(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-slate-600 dark:text-slate-400 flex justify-between">
                          <span>{t('home.calculator.averageDealValue')}</span>
                          <span className="text-primary-600 font-semibold">${averageDealValue}</span>
                        </label>
                        <input
                          type="range"
                          min="1000"
                          max="50000"
                          step="1000"
                          value={averageDealValue}
                          onChange={(e) => setAverageDealValue(parseInt(e.target.value))}
                          className="w-full h-2 bg-primary-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                          <span>$1,000</span>
                          <span>$50,000</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-xl bg-primary-50 p-6 dark:bg-primary-950/40">
                      <div className="text-center">
                        <p className="text-slate-600 dark:text-slate-400 mb-2">{t('home.calculator.estimatedMonthlyRoi')}</p>
                        <p className="text-4xl font-bold text-primary-600">
                          ${calculateMonthlyROI().roi.toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.totalLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {t('home.calculator.leadsValue', { value: leadVolume })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.contactedLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {t('home.calculator.leadsValue', { value: calculateMonthlyROI().contactedLeads })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.meetingsBooked')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().meetingsBooked}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.meetingsSat')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().meetingsSat}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.convertedLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().convertedLeads}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.totalRevenue')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            ${calculateMonthlyROI().totalRevenue.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.totalLeadCost')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            ${calculateMonthlyROI().totalLeadCost.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.calculator.costPerLead')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            ${costPerLead}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          <section id="features" className="w-full bg-white px-4 py-12 dark:bg-slate-950 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                {t('home.approach.title')}
              </h2>
              <p className="mx-auto mb-10 max-w-3xl text-center text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t('home.approach.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {[
                  {
                    icon: <Target className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.targeting.title'),
                    description: t('home.approach.targeting.description')
                  },
                  {
                    icon: <Brain className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.psychometric.title'),
                    description: t('home.approach.psychometric.description')
                  },
                  {
                    icon: <Database className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.verified.title'),
                    description: t('home.approach.verified.description')
                  },
                  {
                    icon: <Linkedin className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.linkedin.title'),
                    description: t('home.approach.linkedin.description')
                  },
                  {
                    icon: <Globe className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.web.title'),
                    description: t('home.approach.web.description')
                  },
                  {
                    icon: <Share2 className="h-6 w-6 text-primary-600" />,
                    title: t('home.approach.social.title'),
                    description: t('home.approach.social.description')
                  }
                ].map((feature, index) => (
                  <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                      {feature.icon}
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-slate-50">{feature.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="testimonials" className="w-full bg-slate-50 px-4 py-12 dark:bg-slate-900/40 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                {t('home.testimonials.title')}
              </h2>
              <p className="mx-auto mb-10 max-w-3xl text-center text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t('home.testimonials.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                  <p className="text-slate-600 dark:text-slate-400 italic text-lg mb-6">"{t('home.testimonials.schieder.quote')}"</p>
                  <div className="w-12 h-1 bg-primary-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">David Schieder</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.testimonials.schieder.role')}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                  <p className="text-slate-600 dark:text-slate-400 italic text-lg mb-6">"{t('home.testimonials.lipscombe.quote')}"</p>
                  <div className="w-12 h-1 bg-primary-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Jacob Lipscombe</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.testimonials.lipscombe.role')}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                  <p className="text-slate-600 dark:text-slate-400 italic text-lg mb-6">"{t('home.testimonials.holt.quote')}"</p>
                  <div className="w-12 h-1 bg-primary-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Samira Holt</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.testimonials.holt.role')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="pricing" className="w-full bg-slate-50 px-4 py-12 dark:bg-slate-900/60 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                {t('home.products.title')}
              </h2>
              <p className="mx-auto mb-10 max-w-3xl text-center text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t('home.products.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {[
                  { 
                    title: t('home.products.qualifiedLeads.title'), 
                    description: t('home.products.qualifiedLeads.description'), 
                    price: "$1-4", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Users className="h-6 w-6 text-primary-600" />
                  },
                  { 
                    title: t('home.products.psychometrics.title'), 
                    description: t('home.products.psychometrics.description'), 
                    price: "$2.50", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Brain className="h-6 w-6 text-primary-600" />
                  },
                  { 
                    title: t('home.products.verifiedContacts.title'), 
                    description: t('home.products.verifiedContacts.description'), 
                    price: "$1.50", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Phone className="h-6 w-6 text-primary-600" />
                  },
                  { 
                    title: t('home.products.salesCoaching.title'), 
                    description: t('home.products.salesCoaching.description'), 
                    price: "$50", 
                    unit: t('home.products.units.perHour'),
                    monthly: false,
                    icon: <MessageSquare className="h-6 w-6 text-primary-600" />
                  },
                  { 
                    title: t('home.products.webOptimization.title'), 
                    description: t('home.products.webOptimization.description'), 
                    price: "$300", 
                    unit: t('home.products.units.perMonth'),
                    monthly: true,
                    icon: <Globe className="h-6 w-6 text-primary-600" />
                  },
                  {
                    title: t('home.products.socialMedia.title'),
                    description: t('home.products.socialMedia.description'),
                    price: "$250",
                    unit: t('home.products.units.perMonth'),
                    monthly: true,
                    icon: <Share2 className="h-6 w-6 text-primary-600" />
                  }
                ].map((product, index) => (
                  <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                      {product.icon}
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{product.title}</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">{product.description}</p>
                    <p className="text-4xl font-bold mb-1 text-slate-900 dark:text-slate-50">
                      {product.price}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mb-6">{product.unit}</p>
                    <button 
                      className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                      onClick={() => {
                        if (isAuthenticated) {
                          navigate('/dashboard/leads');
                        } else {
                          navigate('/signup');
                        }
                      }}
                    >
                      {t('home.getStartedCta')}
                    </button>
                    {product.monthly && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                        {t('home.products.monthlyRenewal')}{" "}
                        <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="packages" className="w-full bg-white px-4 py-12 dark:bg-slate-950 sm:px-6 md:py-16 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <h2 className="mb-3 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
                {t('home.packages.title')}
              </h2>
              <p className="mx-auto mb-10 max-w-3xl text-center text-base text-slate-600 dark:text-slate-400 md:text-lg">
                {t('home.packages.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Users className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.packages.solo.title')}</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-6">{t('home.packages.solo.description')}</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.solo.feature1')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.solo.feature2')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.solo.feature3')}</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 text-slate-900 dark:text-slate-50">
                    $200
                    <span className="text-lg text-slate-600 dark:text-slate-400">{t('home.packages.perMonthSuffix')}</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/signup')}
                  >
                    {t('home.getStartedCta')}
                  </button>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                    {t('home.packages.renewal', { price: '$200' })}{" "}
                    <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                  </p>
                </div>

                <div className="rounded-xl border-2 border-primary-500 bg-white dark:bg-slate-950 p-6 shadow-sm ring-1 ring-primary-100">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Building className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.packages.sme.title')}</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-6">{t('home.packages.sme.description')}</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.sme.feature1')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.sme.feature2')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.sme.feature3')}</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 text-slate-900 dark:text-slate-50">
                    $2,000
                    <span className="text-lg text-slate-600 dark:text-slate-400">{t('home.packages.perMonthSuffix')}</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/signup')}
                  >
                    {t('home.getStartedCta')}
                  </button>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                    {t('home.packages.renewal', { price: '$2,000' })}{" "}
                    <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-none">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-950/60">
                    <Award className="h-6 w-6 text-primary-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-50">{t('home.packages.enterprise.title')}</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-6">{t('home.packages.enterprise.description')}</p>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.enterprise.feature1')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.enterprise.feature2')}</span>
                    </li>
                    <li className="flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                      <span>{t('home.packages.enterprise.feature3')}</span>
                    </li>
                  </ul>
                  <p className="text-4xl font-bold mb-6 text-slate-900 dark:text-slate-50">
                    {t('home.packages.custom')}
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/contact')}
                  >
                    {t('home.packages.contactSales')}
                  </button>
                </div>
              </div>
            </div>
          </section>
      </main>

      <footer className="w-full border-t border-slate-200 bg-white py-10 dark:border-slate-800 dark:bg-slate-950">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-4 md:gap-6 mb-8">
              <div>
                <Link to="/" className="mb-3 inline-block" aria-label={t('home.logoAlt')}>
                  <img src="/images/leadlab-logo.png" alt="" className="h-8 w-auto dark:hidden" />
                  <img src="/images/leadlab-logo-dark.png" alt="" className="hidden h-8 w-auto dark:block" />
                </Link>
                <p className="text-slate-600 dark:text-slate-400">{t('home.footer.tagline')}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerProduct')}</h4>
                <ul className="space-y-2">
                  <li><a href="#features" onClick={scrollToSection('features')} className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('home.footer.features')}</a></li>
                  <li><a href="#pricing" onClick={scrollToSection('pricing')} className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('home.footer.products')}</a></li>
                  <li><a href="#packages" onClick={scrollToSection('packages')} className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('home.footer.packages')}</a></li>
                  <li><a href="#testimonials" onClick={scrollToSection('testimonials')} className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('home.footer.testimonials')}</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerCompany')}</h4>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="#about"
                      onClick={scrollToSection('about')}
                      className="text-slate-600 dark:text-slate-400 hover:text-primary-600"
                    >
                      {t('home.footer.about')}
                    </a>
                  </li>
                  <li>
                    <a
                      href="#pricing"
                      onClick={scrollToSection('pricing')}
                      className="text-slate-600 dark:text-slate-400 hover:text-primary-600"
                    >
                      {t('home.footer.pricing')}
                    </a>
                  </li>
                  <li>
                    <a
                      href="#services"
                      onClick={scrollToSection('services')}
                      className="text-slate-600 dark:text-slate-400 hover:text-primary-600"
                    >
                      {t('home.footer.services')}
                    </a>
                  </li>
                  <li>
                    <Link to="/contact" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">
                      {t('home.footer.contact')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/data-request" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">
                      {t('dataRequestTitle')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/business-diagnostic" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">
                      {t('diagnosticTitle')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/pitch-your-idea" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">
                      {t('pitchTitle')}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerLegal')}</h4>
                <ul className="space-y-2">
                  <li><Link to="/legal?policy=privacy" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('privacyTitle')}</Link></li>
                  <li><Link to="/legal?policy=terms" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('termsTitle')}</Link></li>
                  <li><Link to="/legal?policy=kvkk" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('legal.titles.kvkk')}</Link></li>
                  <li><Link to="/legal?policy=internationalDataProtection" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('legal.titles.internationalDataProtection')}</Link></li>
                  <li><Link to="/legal?policy=cookie" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('cookiesTitle')}</Link></li>
                  <li><Link to="/legal?policy=dmca" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">{t('legal.titles.dmca')}</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center">
              <p className="text-slate-600 dark:text-slate-400">{t('home.footer.rights', { year: new Date().getFullYear() })}</p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <a href="https://www.linkedin.com/company/the-lead-lab-network/" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-primary-600">
                  <FontAwesomeIcon icon={faLinkedin} size="lg" />
                </a>
              </div>
            </div>
          </div>
      </footer>
    </div>
  )
}
