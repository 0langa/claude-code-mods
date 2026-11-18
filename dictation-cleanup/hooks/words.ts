// Common English words. A word that is one of them is spelled right, so the
// AI pass may not "correct" it into a neighbour ("content" into "context",
// "then" into "them", "these" into "those"): only a word that is not on this
// list can be a typo. The list need not be complete. A real word that is
// missing from it is merely open to a respelling the model proposes.

const WORDS = `
a about above across after again against all almost alone along already also although always am among an and another any anybody anyone anything anywhere are around as at away back be because been before behind being below between both but by can cannot could did do does doing done down during each either else enough even ever every everybody everyone everything everywhere few for from further had has have having he her here hers herself him himself his how however i if in inside instead into is it its itself just least less let like many may maybe me might mine more most much must my myself near need neither never next no nobody none nor not nothing now of off often on once one only onto or other others otherwise ought our ours ourselves out outside over own per perhaps please quite rather really same shall she should since so some somebody someone something sometimes somewhere soon still such than that the their theirs them themselves then there these they this those though through thus to together too toward towards under unless until up upon us very was we were what whatever when whenever where wherever whether which while who whoever whom whose why will with within without would yes yet you your yours yourself

accept add agree allow answer appear apply ask assume attach avoid become became begin began begun believe bring brought build built buy bought call came come care carry catch caught change check choose chose chosen clean clear click close collect commit compare complete connect consider contain continue control copy correct cost count cover create cut decide define delete depend describe design detect develop die differ disable discuss display draw drew drawn drive drove driven drop edit enable end enter exist expect explain explore export fail fall fell fallen feel felt fetch fill find found finish fit fix follow forget forgot forgotten format gave generate get give given go goes gone got gotten grow grew grown guess handle hang happen hate hear heard help hide hid hidden hit hold held hope ignore imagine import improve include increase install keep kept kill know knew known land last launch lead led learn leave left lie limit link list listen live load lock log look lose lost love made make manage mark match matter mean meant measure meet met mention merge miss move name note notice open order pass paste pay paid pick place plan play point post prefer prepare press print process produce provide publish pull push put raise ran reach read realize receive record reduce refer release remain remember remove rename render repeat replace reply report request require reset resolve rest restart return review rewrite ride rise run said save saw say scan schedule search see seem seen select sell sold send sent serve set share show shown shut sign sit sat skip sleep slept sort sound speak spoke spoken spend spent split stand stood start state stay stick stuck stop store study submit suggest support suppose switch sync take taken talk teach taught tell test thank think thought throw threw thrown told took touch track train translate treat trigger trust try turn type understand understood update upload use verify view visit wait walk want watch wear went win won wonder work worry write written wrote

account action agent amount animation app area argument article asset audio author background backup balance base batch bit block board body book bot box branch browser budget bug button card case cause channel chapter character chat child choice class client cloud code color column command comment company computer config connection content context couple course credit current custom customer data date day deal decision default desktop detail device difference directory disk document doc door edge editor effect effort email engine entry environment error event example exception experience fact failure feature feedback field file filter folder font form frame friend front function future game goal group guide half hand head history home hook host hour house idea image info information input instance interface internet issue item job key kind language layer layout length level library life light line lot machine man market memory menu message method middle mind minute mistake mode model moment money month mouse movie music network news night node number object offer office option original output owner package page pair panel paper parent part party password past path pattern people percent person phone picture piece pipeline platform plugin policy port position power present price problem product profile program project prompt purpose quality question queue range rate reason region remote repo repository resource response result risk role room root rule sample scene screen script secret section security sense series server service session setting setup shape side site size skill solution song source space speed stage standard status step stock story stream string structure studio stuff style subject success summary system tab table tag target task team template term text thing thread thumbnail time title today token tomorrow tone tool top topic total tree trial unit usage user value version video visual voice volume wall water way web website week window word workflow world year yesterday

able actual available bad basic best better big black blue bright broken busy certain cheap cold common cool crazy dark dead deep different direct double dry early easy empty entire equal exact extra fair fake false fast final fine first flat free fresh full funny general global good great green happy hard heavy high honest hot huge human ideal important insane inner large late later lazy likely little local long loud low lucky main major minor missing modern narrow native natural necessary new nice normal obvious odd old online outer perfect plain poor popular positive possible pretty previous private proper public quick random ready real recent red regular relevant rich right rough round sad safe second separate serious sharp short sick silent similar simple single slow small smart smooth soft solid sorry special specific stable straight strange strict strong stupid sudden super sure sweet tall thick thin tiny tired tough true typical ugly unique unknown upper useful usual valid various visible warm weak weird white whole wide wild worth wrong young

zero two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million billion third fourth fifth twice

actually basically probably definitely obviously literally honestly totally exactly especially generally usually currently recently finally anyway anyways okay yeah yep nope hello thanks welcome
`

const COMMON = new Set(WORDS.split(/\s+/).filter(word => word !== ''))

const ENDINGS = ["'s", 'ing', 'est', 'ed', 'es', 'ly', 'er', 's', 'd']

// A common word, or one with an everyday ending: "builds", "making", "running", "there's".
export const isCommonWord = (word: string) => {
  const folded = word.toLowerCase().replaceAll('’', "'")

  if (COMMON.has(folded)) {
    return true
  }

  return ENDINGS.some(ending => {
    if (!folded.endsWith(ending) || folded.length - ending.length < 2) {
      return false
    }
    const stem = folded.slice(0, -ending.length)

    // "making" is "make", "running" is "run", "tries" is "try".
    return COMMON.has(stem) || COMMON.has(`${stem}e`) || (/(.)\1$/.test(stem) && COMMON.has(stem.slice(0, -1))) || (stem.endsWith('i') && COMMON.has(`${stem.slice(0, -1)}y`))
  })
}
