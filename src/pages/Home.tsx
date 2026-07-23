import Hero from '@/sections/Hero'
import About from '@/sections/About'
import Training from '@/sections/Training'
import Teams from '@/sections/Teams'
import Achievements from '@/sections/Achievements'
import Board from '@/sections/Board'
import Membership from '@/sections/Membership'
import Sponsors from '@/sections/Sponsors'

export default function Home() {
  return (
    <>
      <Hero />
      <About />
      <Training />
      <Membership />
      <Teams />
      <Board />
      <Achievements />
      <Sponsors />
    </>
  )
}
