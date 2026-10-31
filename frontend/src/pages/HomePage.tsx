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
    <div className="relative flex min-h-screen flex-col bg-background font-sans">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[min(100vh,900px)] bg-[radial-gradient(ellipse_at_30%_20%,_rgba(37,99,235,0.12),_transparent_50%),linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(210_40%_96%)_100%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,_rgba(37,99,235,0.18),_transparent_50%),linear-gradient(180deg,_hsl(var(--background))_0%,_hsl(222_47%_8%)_100%)]"
        aria-hidden
      />
      <MarketingNav />

      <div className="relative mx-auto w-full max-w-7xl space-y-0 p-4 pt-28 sm:p-6 sm:pt-32">
        <main className="flex-1 space-y-0">
          {/* Atlas hero: brand + one headline + support + CTA — no stats in first viewport */}
          <section className="flex min-h-[calc(100vh-7rem)] w-full flex-col justify-center py-12 md:py-16">
            <div className="mx-auto w-full max-w-3xl px-4 text-center md:px-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-8 flex justify-center"
              >
                <img
                  src="/images/leadlab-logo.png"
                  alt={t('home.logoAlt')}
                  className="h-16 w-auto sm:h-20 md:h-24"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                className="space-y-4"
              >
                <h1 className="font-display text-4xl leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
                  {t('home.hero.title')}
                </h1>
                <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                  {t('home.hero.subtitle')}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <a
                  href="https://calendly.com/joshua-the-leadlab/15min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-[200px] items-center justify-center rounded-lg bg-primary-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Calendar className="mr-2 h-5 w-5" />
                  {t('home.hero.bookMeeting')}
                </a>
                <Link
                  to="/intake"
                  className="inline-flex min-w-[200px] items-center justify-center rounded-lg border border-border bg-card px-6 py-3.5 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('home.hero.tellUs')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </motion.div>

              {isAuthenticated && (
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    to="/dashboard"
                    className="text-center text-sm font-medium text-primary-600 underline-offset-4 hover:underline"
                  >
                    {t('home.hero.openDashboard')}
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="w-full border-t border-border py-16" aria-label="Results">
            <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="mb-1 text-3xl font-semibold text-primary-600 md:text-4xl">
                    <CountUp end={stat.number} duration={2} />
                    {stat.suffix}
                  </div>
                  <p className="text-sm text-muted-foreground">{stat.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="about" className="w-full py-16 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 font-display text-foreground">
                  {t('home.about.title')}
                </h2>
                <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
                  {t('home.about.intro')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Target className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.mission.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.mission.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Eye className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.vision.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.vision.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Shield className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.values.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.values.body')}
                  </p>
                </motion.div>
              </div>

              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 font-display text-foreground">
                  {t('home.about.problemsTitle')}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Clock className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.problems.timeConsuming.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.problems.timeConsuming.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Filter className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.problems.qualification.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.problems.qualification.body')}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Crosshair className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.about.problems.targeting.title')}</h3>
                  <p className="text-muted-foreground">
                    {t('home.about.problems.targeting.body')}
                  </p>
                </motion.div>
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 font-display text-foreground">
                  {t('home.why.title')}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  {t('home.why.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    icon: <Trophy className="w-12 h-12 text-primary-600" />,
                    title: t('home.why.accuracy.title'),
                    description: t('home.why.accuracy.description')
                  },
                  {
                    icon: <Rocket className="w-12 h-12 text-primary-600" />,
                    title: t('home.why.implementation.title'),
                    description: t('home.why.implementation.description')
                  },
                  {
                    icon: <TrendingUp className="w-12 h-12 text-primary-600" />,
                    title: t('home.why.roi.title'),
                    description: t('home.why.roi.description')
                  }
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: index * 0.2 }}
                    className="bg-card p-8 rounded-xl shadow-sm border border-border"
                  >
                    <div className="bg-card w-20 h-20 rounded-xl flex items-center justify-center mb-6 shadow-md">
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-card" id="services">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 font-display text-foreground">
                  {t('home.how.title')}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  {t('home.how.subtitle')}
                </p>
              </div>

              <div className="relative">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-blue-200 transform -translate-y-1/2 hidden md:block"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  {[
                    {
                      icon: <Target className="w-8 h-8 text-primary-600" />,
                      title: t('home.how.define.title'),
                      description: t('home.how.define.description')
                    },
                    {
                      icon: <Search className="w-8 h-8 text-primary-600" />,
                      title: t('home.how.search.title'),
                      description: t('home.how.search.description')
                    },
                    {
                      icon: <Brain className="w-8 h-8 text-primary-600" />,
                      title: t('home.how.enrich.title'),
                      description: t('home.how.enrich.description')
                    },
                    {
                      icon: <BarChart className="w-8 h-8 text-primary-600" />,
                      title: t('home.how.convert.title'),
                      description: t('home.how.convert.description')
                    }
                  ].map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: index * 0.2 }}
                      className="bg-card p-8 rounded-xl shadow-sm border border-border relative z-10"
                    >
                      <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                        {step.icon}
                      </div>
                      <h3 className="text-xl font-bold mb-4">{step.title}</h3>
                      <p className="text-muted-foreground">{step.description}</p>
                      <div className="absolute top-8 right-8 text-blue-200 font-bold text-4xl">
                        {index + 1}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="w-full py-16 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 mb-4 font-display text-foreground">
                  {t('home.results.title')}
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  {t('home.results.subtitle')}
                </p>
              </div>

              <div className="max-w-4xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className="bg-card p-8 rounded-xl shadow-sm border border-border"
                >
                  <h3 className="text-2xl font-bold mb-6">{t('home.calculator.title')}</h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>100</span>
                          <span>1000</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>$1</span>
                          <span>$10</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>1%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-muted-foreground flex justify-between">
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
                          className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>$1,000</span>
                          <span>$50,000</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-xl space-y-4">
                      <div className="text-center">
                        <p className="text-muted-foreground mb-2">{t('home.calculator.estimatedMonthlyRoi')}</p>
                        <p className="text-4xl font-bold text-primary-600">
                          ${calculateMonthlyROI().roi.toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.totalLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {t('home.calculator.leadsValue', { value: leadVolume })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.contactedLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {t('home.calculator.leadsValue', { value: calculateMonthlyROI().contactedLeads })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.meetingsBooked')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().meetingsBooked}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.meetingsSat')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().meetingsSat}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.convertedLeads')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            {calculateMonthlyROI().convertedLeads}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.totalRevenue')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            ${calculateMonthlyROI().totalRevenue.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.totalLeadCost')}</p>
                          <p className="text-lg font-semibold text-primary-600">
                            ${calculateMonthlyROI().totalLeadCost.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('home.calculator.costPerLead')}</p>
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

          <section id="features" className="w-full py-16 md:py-24 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 font-display text-foreground">
                {t('home.approach.title')}
              </h2>
              <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
                {t('home.approach.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  {
                    icon: <Target className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.targeting.title'),
                    description: t('home.approach.targeting.description')
                  },
                  {
                    icon: <Brain className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.psychometric.title'),
                    description: t('home.approach.psychometric.description')
                  },
                  {
                    icon: <Database className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.verified.title'),
                    description: t('home.approach.verified.description')
                  },
                  {
                    icon: <Linkedin className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.linkedin.title'),
                    description: t('home.approach.linkedin.description')
                  },
                  {
                    icon: <Globe className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.web.title'),
                    description: t('home.approach.web.description')
                  },
                  {
                    icon: <Share2 className="w-8 h-8 text-primary-600" />,
                    title: t('home.approach.social.title'),
                    description: t('home.approach.social.description')
                  }
                ].map((feature, index) => (
                  <div key={index} className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                    <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="testimonials" className="w-full py-16 md:py-24 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 font-display text-foreground">
                {t('home.testimonials.title')}
              </h2>
              <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
                {t('home.testimonials.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                  <p className="text-muted-foreground italic text-lg mb-6">"{t('home.testimonials.schieder.quote')}"</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">David Schieder</h4>
                    <p className="text-sm text-muted-foreground">{t('home.testimonials.schieder.role')}</p>
                  </div>
                </div>

                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                  <p className="text-muted-foreground italic text-lg mb-6">"{t('home.testimonials.lipscombe.quote')}"</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Jacob Lipscombe</h4>
                    <p className="text-sm text-muted-foreground">{t('home.testimonials.lipscombe.role')}</p>
                  </div>
                </div>

                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                  <p className="text-muted-foreground italic text-lg mb-6">"{t('home.testimonials.holt.quote')}"</p>
                  <div className="w-12 h-1 bg-blue-600 rounded-full mb-4"></div>
                  <div>
                    <h4 className="font-semibold">Samira Holt</h4>
                    <p className="text-sm text-muted-foreground">{t('home.testimonials.holt.role')}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="pricing" className="w-full py-16 md:py-24 bg-muted/40">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 font-display text-foreground">
                {t('home.products.title')}
              </h2>
              <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
                {t('home.products.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { 
                    title: t('home.products.qualifiedLeads.title'), 
                    description: t('home.products.qualifiedLeads.description'), 
                    price: "$1-4", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Users className="w-8 h-8 text-primary-600" />
                  },
                  { 
                    title: t('home.products.psychometrics.title'), 
                    description: t('home.products.psychometrics.description'), 
                    price: "$2.50", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Brain className="w-8 h-8 text-primary-600" />
                  },
                  { 
                    title: t('home.products.verifiedContacts.title'), 
                    description: t('home.products.verifiedContacts.description'), 
                    price: "$1.50", 
                    unit: t('home.products.units.each'),
                    monthly: false,
                    icon: <Phone className="w-8 h-8 text-primary-600" />
                  },
                  { 
                    title: t('home.products.salesCoaching.title'), 
                    description: t('home.products.salesCoaching.description'), 
                    price: "$50", 
                    unit: t('home.products.units.perHour'),
                    monthly: false,
                    icon: <MessageSquare className="w-8 h-8 text-primary-600" />
                  },
                  { 
                    title: t('home.products.webOptimization.title'), 
                    description: t('home.products.webOptimization.description'), 
                    price: "$300", 
                    unit: t('home.products.units.perMonth'),
                    monthly: true,
                    icon: <Globe className="w-8 h-8 text-primary-600" />
                  },
                  {
                    title: t('home.products.socialMedia.title'),
                    description: t('home.products.socialMedia.description'),
                    price: "$250",
                    unit: t('home.products.units.perMonth'),
                    monthly: true,
                    icon: <Share2 className="w-8 h-8 text-primary-600" />
                  }
                ].map((product, index) => (
                  <div key={index} className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                    <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                      {product.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{product.title}</h3>
                    <p className="text-muted-foreground mb-4">{product.description}</p>
                    <p className="text-4xl font-bold mb-1 font-display text-foreground">
                      {product.price}
                    </p>
                    <p className="text-muted-foreground mb-6">{product.unit}</p>
                    <button 
                      className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
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
                      <p className="text-xs text-muted-foreground mt-3">
                        {t('home.products.monthlyRenewal')}{" "}
                        <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="packages" className="w-full py-16 md:py-24 bg-card">
            <div className="w-full max-w-[2000px] px-4 md:px-6 mx-auto">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl leading-[1.2] pb-1 text-center mb-8 font-display text-foreground">
                {t('home.packages.title')}
              </h2>
              <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
                {t('home.packages.subtitle')}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Users className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.packages.solo.title')}</h3>
                  <p className="text-muted-foreground mb-6">{t('home.packages.solo.description')}</p>
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
                  <p className="text-4xl font-bold mb-6 font-display text-foreground">
                    $200
                    <span className="text-lg text-muted-foreground">{t('home.packages.perMonthSuffix')}</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/signup')}
                  >
                    {t('home.getStartedCta')}
                  </button>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('home.packages.renewal', { price: '$200' })}{" "}
                    <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                  </p>
                </div>

                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-blue-200 transform scale-105">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Building className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.packages.sme.title')}</h3>
                  <p className="text-muted-foreground mb-6">{t('home.packages.sme.description')}</p>
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
                  <p className="text-4xl font-bold mb-6 font-display text-foreground">
                    $2,000
                    <span className="text-lg text-muted-foreground">{t('home.packages.perMonthSuffix')}</span>
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/signup')}
                  >
                    {t('home.getStartedCta')}
                  </button>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('home.packages.renewal', { price: '$2,000' })}{" "}
                    <Link to="/legal?policy=terms" className="underline">{t('home.packages.terms')}</Link>
                  </p>
                </div>

                <div className="bg-card p-8 rounded-2xl shadow-md hover:shadow-xl transition-colors duration-150 border border-gray-100">
                  <div className="bg-blue-50 w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                    <Award className="w-8 h-8 text-primary-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{t('home.packages.enterprise.title')}</h3>
                  <p className="text-muted-foreground mb-6">{t('home.packages.enterprise.description')}</p>
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
                  <p className="text-4xl font-bold mb-6 font-display text-foreground">
                    {t('home.packages.custom')}
                  </p>
                  <button 
                    className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-150 shadow-sm"
                    onClick={() => navigate('/contact')}
                  >
                    {t('home.packages.contactSales')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-card py-12 border-t">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div>
                <Link to="/">
                  <img src="/images/leadlab-logo.png" alt={t('home.logoAlt')} className="h-12 w-auto mb-4" />
                </Link>
                <p className="text-muted-foreground">{t('home.footer.tagline')}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerProduct')}</h4>
                <ul className="space-y-2">
                  <li><a href="#features" onClick={scrollToSection('features')} className="text-muted-foreground hover:text-primary-600">{t('home.footer.features')}</a></li>
                  <li><a href="#pricing" onClick={scrollToSection('pricing')} className="text-muted-foreground hover:text-primary-600">{t('home.footer.products')}</a></li>
                  <li><a href="#packages" onClick={scrollToSection('packages')} className="text-muted-foreground hover:text-primary-600">{t('home.footer.packages')}</a></li>
                  <li><a href="#testimonials" onClick={scrollToSection('testimonials')} className="text-muted-foreground hover:text-primary-600">{t('home.footer.testimonials')}</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerCompany')}</h4>
                <ul className="space-y-2">
                  <li>
                    <a
                      href="#about"
                      onClick={scrollToSection('about')}
                      className="text-muted-foreground hover:text-primary-600"
                    >
                      {t('home.footer.about')}
                    </a>
                  </li>
                  <li>
                    <a
                      href="#pricing"
                      onClick={scrollToSection('pricing')}
                      className="text-muted-foreground hover:text-primary-600"
                    >
                      {t('home.footer.pricing')}
                    </a>
                  </li>
                  <li>
                    <a
                      href="#services"
                      onClick={scrollToSection('services')}
                      className="text-muted-foreground hover:text-primary-600"
                    >
                      {t('home.footer.services')}
                    </a>
                  </li>
                  <li>
                    <Link to="/contact" className="text-muted-foreground hover:text-primary-600">
                      {t('home.footer.contact')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/data-request" className="text-muted-foreground hover:text-primary-600">
                      {t('dataRequestTitle')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/business-diagnostic" className="text-muted-foreground hover:text-primary-600">
                      {t('diagnosticTitle')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/intake/pitch-your-idea" className="text-muted-foreground hover:text-primary-600">
                      {t('pitchTitle')}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">{t('footerLegal')}</h4>
                <ul className="space-y-2">
                  <li><Link to="/legal?policy=privacy" className="text-muted-foreground hover:text-primary-600">{t('privacyTitle')}</Link></li>
                  <li><Link to="/legal?policy=terms" className="text-muted-foreground hover:text-primary-600">{t('termsTitle')}</Link></li>
                  <li><Link to="/legal?policy=kvkk" className="text-muted-foreground hover:text-primary-600">{t('legal.titles.kvkk')}</Link></li>
                  <li><Link to="/legal?policy=internationalDataProtection" className="text-muted-foreground hover:text-primary-600">{t('legal.titles.internationalDataProtection')}</Link></li>
                  <li><Link to="/legal?policy=cookie" className="text-muted-foreground hover:text-primary-600">{t('cookiesTitle')}</Link></li>
                  <li><Link to="/legal?policy=dmca" className="text-muted-foreground hover:text-primary-600">{t('legal.titles.dmca')}</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center">
              <p className="text-muted-foreground">{t('home.footer.rights', { year: new Date().getFullYear() })}</p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <a href="https://www.linkedin.com/company/the-lead-lab-network/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary-600">
                  <FontAwesomeIcon icon={faLinkedin} size="lg" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
